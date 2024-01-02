const { dyanmodb_client, dynamodb_table_name } = require("./AWSClients.js");

async function get_package_meta(name, version) {
  const result = await dyanmodb_client
    .query({
      TableName: dynamodb_table_name,
      KeyConditionExpression: "PackageName = :pn AND PackageVersion = :pv",
      ExpressionAttributeValues: {
        [":pn"]: name,
        [":pv"]: version,
      },
    })
    .promise();

  if (result.Count < 1) {
    throw new Error(`The package ${name} v${version} could not be found.`);
  }

  return result.Items[0];
}

module.exports = get_package_meta;
