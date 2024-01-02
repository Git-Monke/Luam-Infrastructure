const AWS = require("aws-sdk");
AWS.config.update({ region: "us-west-2" });

const docClient = new AWS.DynamoDB.DocumentClient({ apiVersion: "2012-08-10" });
const dynamodb_table_name = "luam_api_tokens";

const axios = require("axios");
const sha256 = require("js-sha256");

const idCharSet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function id(length) {
  return ((chars) => {
    return chars.reduce((p, c) => p + idCharSet[c], "");
  })(Array.from({ length }, () => ~~(Math.random() * idCharSet.length)));
}

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const user_data_response = await axios.get("https://api.github.com/user", {
      headers: {
        Authorization: `${event.headers.Authorization}`,
      },
    });

    if (user_data_response.error) {
      throw new Error(user_data_response.error);
    }

    const user_data = user_data_response.data;
    const token = id(36);

    const item = {
      UserID: user_data.id,
      TokenIDHash: sha256(token),
      Name: body.name,
      CreatedAt: Date.now(),
      ExpirationDate: body.expirationDate || 0,
      Scopes: body.scopes,
      PackageNamePattern: body.namePattern || "",
      AllowedUses: body.allowedUses || 0,
      Uses: 0,
      Valid: true,
    };

    await docClient
      .put({
        TableName: dynamodb_table_name,
        Item: item,
      })
      .promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        token,
        tokenData: item,
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
