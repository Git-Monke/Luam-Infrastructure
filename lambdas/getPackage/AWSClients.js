const AWS = require("aws-sdk");

const s3 = new AWS.S3();
const dyanmodb_client = new AWS.DynamoDB.DocumentClient({
  apiVersion: "2012-08-10",
});
const dynamodb_table_name = "luam_package_metadata";

module.exports = { s3, dyanmodb_client, dynamodb_table_name };
