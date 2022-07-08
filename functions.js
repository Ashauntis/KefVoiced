const aws = require("aws-sdk");

aws.config.getCredentials(function(err) {
    if (err) {
      console.log(err.stack);
    } else {
      console.log("Successfully logged into AWS");
    }
});

const dynamo = new aws.DynamoDB({
    apiVersion: "2012-08-10",
    region: "us-east-1",
});

function makeDefaultSettings(userID) {
    return {
      [userID]: {
        global: {
          voice: "Salli",
        },
      },
    };
  }

function makeDefaultGuildSettings(guildID) {
  return {
    [guildID]: {
      log: null,
    },
  };
}

function makeEmptyCacheEntry(userID) {
    return {
        [userID]: {
        },
    };
}

async function load_document(id) {
  // set result_data to null to start
  let result_data = null;

  // specify the parameters for the getItem call
  const params = {
    TableName: "kef_voiced_settings",
    Key: {
      id: { S: id },
    },
  };

  console.log("Loading document with id: " + id);
  // get the document from Amazon DynamoDB
  await dynamo.getItem(params, function(err, data) {
      if (err) {
        console.log(err, err.stack);
      } else if (Object.keys(data).length == 0) {
        // console.log("No document found with id: " + id);
      } else {
        // console.dir(data);
        result_data = JSON.parse(data.Item.value.S);
      }
    })
    .promise();

  if (result_data == null) {
    // console.log(`Document not found: ${id}`);
  } else {
    console.log(`Successfully loaded document: ${id} `);
  }

  return result_data;
}

async function save_document(data_object, id) {
  // create a new document from a stringified object
  const value = JSON.stringify(data_object);

  // specify the parameters for the putItem call
  const params = {
    TableName: "kef_voiced_settings",
    Item: {
      id: { S: id },
      value: { S: value },
    },
  };

  // store the document in Amazon DynamoDB
  const r = await dynamo
    .putItem(params, function(err) {
      if (err) {
        console.log("Error", err, err.stack);
      } else {
        console.log(`Document added. ID: ${id}, Data:`);
        console.dir(data_object);
      }
    })
    .promise();

  return r;
}

module.exports = {
    makeDefaultSettings,
    makeDefaultGuildSettings,
    makeEmptyCacheEntry,
    load_document,
    save_document,
};