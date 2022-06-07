const aws = require("aws-sdk");

// log into AWS Services
aws.config.getCredentials(function(err) {
    if (err) {
      console.log(err.stack);
    } else {
      console.log("Successfully logged into AWS");
    }
  });

module.exports = {
    aws,
};