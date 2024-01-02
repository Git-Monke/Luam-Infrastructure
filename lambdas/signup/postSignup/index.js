const CLIENT_ID = "c646c8207bf56344f8d5";
const CLIENT_SECRET = "2c2e89e5a8303dc6653e1de128f80767d61aa829";

const AWS = require("aws-sdk");
AWS.config.update({ region: "us-west-2" });

const docClient = new AWS.DynamoDB.DocumentClient({ apiVersion: "2012-08-10" });
const dynamodb_table_name = "luam_users";

const axios = require("axios");

exports.handler = async (event) => {
  try {
    const params = `?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&code=${event.headers["x-code"]}`;

    const github_data_response = await axios.post(
      `https://github.com/login/oauth/access_token${params}`,
      {},
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (github_data_response.error) {
      return {
        statusCode: github_data_response.status,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: github_data.error_description }),
      };
    }

    const github_data = github_data_response.data;

    const user_data_response = await axios.get("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${github_data.access_token}`,
      },
    });

    const user_data = user_data_response.data;

    // const user_data = {
    //   login: "Git-Monke",
    //   id: 82415608,
    //   avatar_url: "https://avatars.githubusercontent.com/u/82415608?v=4",
    //   html_url: "https://github.com/Git-Monke",
    //   name: "Monke",
    // };

    const result = await docClient
      .query({
        TableName: dynamodb_table_name,
        KeyConditionExpression: "UserID = :ui",
        ExpressionAttributeValues: {
          [":ui"]: user_data.id,
        },
      })
      .promise();

    const new_entry = {
      UserID: user_data.id,
      Login: user_data.login,
      AvatarUrl: user_data.avatar_url,
      HtmlUrl: user_data.html_url,
      Name: user_data.name,
    };

    if (result.Items.length === 0) {
      await docClient
        .put({
          TableName: dynamodb_table_name,
          Item: new_entry,
        })
        .promise();
    }

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Signed in successfully",
        access_token: github_data.access_token,
        user_data: new_entry,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: err.message || "Unknown Internal Server Error",
      }),
    };
  }
};
