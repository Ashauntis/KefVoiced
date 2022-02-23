// Copyright (C) 2022 by Kayla Grey + Jared De Blander
// Kayla's Amazon DynamoDB middleware

// load environment variables if they are present
import dotenv from './node_modules/dotenv/lib/main.js';
import * as awssdk from './node_modules/aws-sdk/lib/aws.js';

const aws = awssdk;
dotenv.config();

class kdb {
    constructor() {
        // login to Amazon DynamoDB
        console.log(aws.config);
        console.log(aws.Config);
        console.log('Connecting to Amazon DynamoDB...');
        aws.config.getCredentials(function(err) {
            if (err) {
                console.log(err.stack);
            } else {
                console.log('Successfully logged into AWS');
            }
        });
        this.dynamo = new aws.DynamoDB ({ apiVersion: '2012-08-10', region: 'us-east-1' });
        console.log('Connected to Amazon DynamoDB');
        // console.dir(this.dynamo);
    }

    list_tables() {
        const params = {};
        this.dynamo.listTables(params, function(err, data) {
            if (err) {
                console.log(err, err.stack);
            } else {
                console.log(data);
            }
        });
    }

    makeid(length = 64) {
        let result = '';
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const charactersLength = characters.length;

        for (let i = 0; i < length; i++) {
          result += characters.charAt(Math.floor(Math.random() * charactersLength));
        }

       return result;
    }

    load_document(id) {
        // set result_data to null to start
        let result_data = null;

        // specify the parameters for the getItem call
        const params = {
            TableName: 'kef_voiced_settings',
            Key: {
                'id': { S: id },
            },
        };

        // get the document from Amazon DynamoDB
        this.dynamo.getItem(params, function(err, data) {
            if (err) {
                console.log(err, err.stack);
            } else {
                result_data = JSON.parse(data.Item.value.S);
                console.dir(result_data);
            }
        });

        return result_data;
    }

    save_document(data_object, id = null) {

        // create a unique id if one is not provided
        let final_id = null;
        if (id === null) {
            final_id = this.makeid();
        } else {
            final_id = id;
        }

        // create a new document from a stringified object
        const value = JSON.stringify(data_object);

        // specify the parameters for the putItem call
        const params = {
            TableName: 'kef_voiced_settings',
            Item: {
                id: { S: final_id },
                value: { S: value },
                timestamp: { S: new Date().getTime() },
            },
        };

        // store the document in Amazon DynamoDB
        this.dynamo.putItem(params, function(err) {
            if (err) {
                console.log('Error', err, err.stack);
            } else {
                console.log('Successfully added!');
            }
        });

        // return the id of the document
        return final_id;
    }

    create_user_setting() {
        this.save_document({voice: 'default'}, 'user_settings');
    }

    create_guild_setting(voiceInput, channelInput) {
        this.save_document({ voice: voiceInput, channel: channelInput }, 'guild_settings');
    }
}

// const r = new kdb();

// export default class { kdb };
export { kdb };
