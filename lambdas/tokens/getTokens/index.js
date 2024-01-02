const AWS = require("aws-sdk");
AWS.config.update({ region: "us-west-2" });

const docClient = new AWS.DynamoDB.DocumentClient({ apiVersion: "2012-08-10" });
const dynamodb_table_name = "luam_api_tokens";

const axios = require("axios");
const sha256 = require("js-sha256");

exports.handler = async (event) => {
  try {
    const user_data_response = await axios.get("https://api.github.com/user", {
      headers: {
        Authorization: `${event.headers.Authorization}`,
      },
    });

    if (user_data_response.error) {
      throw new Error(user_data_response.error);
    }

    const user_data = user_data_response.data;

    const query_result = await docClient
      .query({
        TableName: dynamodb_table_name,
        KeyConditionExpression: "UserID = :uid",
        ExpressionAttributeValues: {
          [":uid"]: user_data.id,
        },
      })
      .promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        Items: query_result.Items,
      }),
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: err.message || "Uncaught internal server error",
      }),
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
    };
  }
};
