const aws = require("aws-sdk");

aws.config.getCredentials(function(err) {
    if (err) {
      console.log(err.stack);
    } else {
      console.log("Successfully logged into AWS");
    }
  });


const polly = new aws.Polly({ apiVersion: "2016-06-10", region: "us-east-1" });

module.exports = {
    polly,
};