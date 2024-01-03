const zlib = require("zlib");
const AWS = require("aws-sdk");
AWS.config.update({ region: "us-west-2" });

const semver = require("semver");
const sha256 = require("js-sha256");

const s3 = new AWS.S3();
const docClient = new AWS.DynamoDB.DocumentClient({ apiVersion: "2012-08-10" });

const luam_packages_table = "luam_package_metadata";
const luam_api_tokens_table = "luam_api_tokens";

async function getPackageMeta(name, version = "0.0.0") {
  const result = await docClient
    .query({
      TableName: luam_packages_table,
      KeyConditionExpression: "PackageName = :pn AND PackageVersion = :pv",
      ExpressionAttributeValues: {
        [":pn"]: name,
        [":pv"]: version,
      },
    })
    .promise();

  return result.Items[0];
}

async function uploadPayload(body) {
  const buffer = Buffer.from(body.payload, "base64");

  const gzip = await new Promise((resolve, reject) => {
    zlib.gzip(buffer, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });

  const params = {
    Bucket: "luam-package-files",
    Key: `${body.name}/${body.name}-${body.version}.gz`,
    Body: gzip,
  };

  await s3.putObject(params).promise();
}

function defaultPackageMeta(body, owner) {
  return {
    Versions: [body.version],
    LatestVersion: body.version,
    PackageVersion: "0.0.0",
    PackageName: body.name,
    DateCreated: new Date().toISOString(),
    Owners: [owner],
  };
}

function buildNewEntry(body) {
  return {
    PackageName: body.name,
    PackageVersion: body.version,
    Dependencies: body.dependencies,
    DateCreated: new Date().toISOString(),
  };
}

exports.handler = async (event) => {
  try {
    const api_token = event.headers.Authorization;
    const api_token_query = await docClient
      .query({
        TableName: luam_api_tokens_table,
        IndexName: "TokenIDHash-index",
        KeyConditionExpression: "TokenIDHash = :tih",
        ExpressionAttributeValues: {
          ":tih": sha256(api_token),
        },
      })
      .promise();

    if (api_token_query.Count < 1) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          message: "The API token provided could not be found in the registry",
        }),
      };
    }

    const api_token_data = api_token_query.Items[0];

    if (!api_token_data.Valid) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          message:
            "The provided API token has been deactivated and is no longer valid",
        }),
      };
    }

    if (
      api_token_data.ExpirationDate !== 0 &&
      Date.now() > api_token_data.ExpirationDate
    ) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          message: `The provided API token expired ${new Date(
            api_token_data.ExpirationDate
          ).toISOString()} and is no longer valid`,
        }),
      };
    }

    // Query for the package's metadata

    const body = JSON.parse(event.body);

    const params = {
      TableName: luam_packages_table,
      KeyConditionExpression: "PackageName = :pk AND PackageVersion = :sk",
      ExpressionAttributeValues: {
        ":pk": body.name,
        ":sk": "0.0.0",
      },
    };

    const result = await docClient.query(params).promise();
    const existedPreviously = result.Count > 0;
    const packageMeta =
      result.Items[0] || defaultPackageMeta(body, api_token_data.UserID);

    if (existedPreviously) {
      if (!packageMeta.Owners.includes(api_token_data.UserID)) {
        return {
          statusCode: 401,
          body: JSON.stringify({
            message:
              "The provided api token was not created by an owner of the package you are trying to update.",
          }),
        };
      }

      if (!api_token_data.Scopes["publish-update"]) {
        return {
          statusCode: 401,
          body: JSON.stringify({
            message:
              "The provided api token is not authorized to publish updates to existing packages.",
          }),
        };
      }
    }

    if (!existedPreviously && !api_token_data.Scopes["publish-new"]) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          message:
            "The provided api token is not authorized to publish new packages.",
        }),
      };
    }

    // Ensure the requested upload version is valid

    if (!semver.valid(body.version)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "MalformedVersion",
          detail: `The provided version string ${body.version} did not abide to SemVer v2.0.0 standards.`,
        }),
      };
    }

    // Verify that all of the dependencies exist and have an existing version compatible with the specified version range.

    for (let [package, versionRange] of Object.entries(body.dependencies)) {
      if (!semver.validRange(versionRange)) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            message: `The package ${package} has a malformed version string: ${versionRange}`,
          }),
        };
      }

      const packageMeta = await getPackageMeta(package);

      if (!packageMeta) {
        return {
          statusCode: 404,
          body: JSON.stringify({
            message: `The package ${package} does not exist.`,
          }),
        };
      }
      const allVersions = packageMeta.Versions;
      console.log(packageMeta);
      if (
        !allVersions.some((version) => semver.satisfies(version, versionRange))
      ) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            message: `There is no version of ${package} compatible with ${versionRange}. Possible valid versions: ${allVersions}`,
          }),
        };
      }
    }

    // Create new metadata if this is the first time publishing

    if (!existedPreviously) {
      console.log(
        `${body.name} did not exist previously. Creating new entry in DynamoDB.`
      );

      await docClient
        .put({
          TableName: luam_packages_table,
          Item: packageMeta,
        })
        .promise();
    }

    // Update existing metadata

    if (existedPreviously) {
      if (semver.gte(packageMeta.LatestVersion, body.version)) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            message: "InvalidVersion",
            detail: `The provided version (${body.version}) did not increase from the last version (${packageMeta.LatestVersion})`,
          }),
        };
      }

      await docClient
        .update({
          TableName: luam_packages_table,
          Key: {
            PackageName: body.name,
            PackageVersion: "0.0.0",
          },
          UpdateExpression: "set LatestVersion = :lv, Versions = :vl",
          ExpressionAttributeValues: {
            ":lv": body.version,
            ":vl": [...packageMeta.Versions, body.version],
          },
        })
        .promise();
    }

    // Post the new package entry

    await docClient
      .put({
        TableName: luam_packages_table,
        Item: buildNewEntry(body),
      })
      .promise();

    // Post the payload to the S3 bucket

    await uploadPayload(body);

    return {
      statusCode: 200,
      body: JSON.stringify(`Successfully posted ${body.name} ${body.version}`),
    };
  } catch (err) {
    console.log(err);
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify(err),
    };
  }
};
