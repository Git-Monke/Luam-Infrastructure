const zlib = require("zlib");
const AWS = require("aws-sdk");

const s3 = new AWS.S3();
const docClient = new AWS.DynamoDB.DocumentClient({ apiVersion: "2012-08-10" });

const dynamodb_table_name = "luam_package_metadata";

class APIError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode || 500;
  }
}

// Doesn't verify that name or version exists. Assumes that other functions will validate query parameters first
async function getPackageMeta(name, version = "0.0.0") {
  if (!name) {
    throw new APIError(
      'No "name" field was included in the query parameters of the request.'
    );
  }

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

  if (result.Count > 1) {
    throw new APIError(
      `The package ${name} v${version} could not be found.`,
      404
    );
  }

  return result.Items[0];
}

async function getPackageFile(name, version) {
  if (!name || !version) {
    let missingFields = [];
    if (!name) missingFields.push("name");
    if (!version) missingFields.push("version");

    return {
      statusCode: 400,
      body: JSON.stringify({
        message: `Missing required query parameters: ${missingFields}`,
      }),
    };
  }

  const params = {
    Bucket: "luam-package-files",
    Key: `${name}/${name}-${version}.gz`,
  };

  const meta = await getPackageMeta(name, version);

  const data = await s3.getObject(params).promise();
  const uncompressedData = zlib.gunzipSync(data.Body);
  const payload = uncompressedData.toString("base64");

  return {
    statusCode: 200,
    body: JSON.stringify({
      payload: payload,
      meta: meta,
    }),
  };
}

exports.handler = async (event) => {
  const dataType = event.headers["X-Package-Data-Type"];

  const queryParams = event.queryStringParameters || {};
  const name = queryParams.name;
  const version = queryParams.version;

  try {
    if (dataType === "metadata") {
      const result = await getPackageMeta(name);
      return {
        statusCode: 200,
        body: JSON.stringify(result),
      };
    }

    if (dataType === "file") {
      return await getPackageFile(name, version);
    }

    return {
      statusCode: 400,
      body: JSON.stringify({
        message: `Expected header X-Package-Data-Type to be either "metadata" or "file". Got ${dataType}`,
      }),
    };
  } catch (err) {
    return {
      statusCode: err.statusCode || 500,
      body: JSON.stringify({
        message: `${err}`,
      }),
    };
  }
};
