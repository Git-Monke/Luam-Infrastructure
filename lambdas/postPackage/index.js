const zlib = require("zlib");
const AWS = require("aws-sdk");
AWS.config.update({ region: "us-west-2" });

const semver = require("semver");

const s3 = new AWS.S3();
const docClient = new AWS.DynamoDB.DocumentClient({ apiVersion: "2012-08-10" });

const dynamodb_table_name = "luam_package_metadata";

async function getPackageMeta(name, version = "0.0.0") {
  const result = await docClient
    .query({
      TableName: dynamodb_table_name,
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

function defaultPackageMeta(body) {
  return {
    Versions: [body.version],
    LatestVersion: body.version,
    PackageVersion: "0.0.0",
    PackageName: body.name,
    DateCreated: new Date().toISOString(),
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
    const body = JSON.parse(event.body);

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

    // Query for the package's metadata

    const params = {
      TableName: dynamodb_table_name,
      KeyConditionExpression: "PackageName = :pk AND PackageVersion = :sk",
      ExpressionAttributeValues: {
        ":pk": body.name,
        ":sk": "0.0.0",
      },
    };

    const result = await docClient.query(params).promise();
    const existedPreviously = result.Count > 0;
    const packageMeta = result.Items[0] || defaultPackageMeta(body);

    // Create new metadata if this is the first time publishing

    if (!existedPreviously) {
      console.log(
        `${body.name} did not exist previously. Creating new entry in DynamoDB.`
      );

      await docClient
        .put({
          TableName: dynamodb_table_name,
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
          TableName: dynamodb_table_name,
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
        TableName: dynamodb_table_name,
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
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify(`Internal server error: ${err.message}`),
    };
  }
};
