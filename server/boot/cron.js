'use strict';
var CronJob = require('cron').CronJob;
var moment = require('moment');
var client = require('../esConnection.js');
var bulk = [];

module.exports = function setupCron(server) {

    var makebulk = function(modelInstances, modelName, typeDifferentiator, callback){
        bulk = [];
        for (var current in modelInstances){
            var typeValue = typeDifferentiator === 'none'? modelName: modelInstances[current][typeDifferentiator];
            bulk.push(
                // {action: {metadata}}
                { index: {_index: modelName, _type: typeValue, _id: modelInstances[current].id } },
                modelInstances[current]
            );
        }
        callback(bulk);
    };

    var indexall = function(madebulk, modelName, callback) {
        client.bulk({
            maxRetries: 5,
            body: madebulk
        },function(err,resp,status) {
            if (err) {
                console.log(err);
            }
            else {
                callback(resp.items);
            }
        })
    };

    // Setup cron to index data on ES
    var indexingJob = new CronJob('00 00 * * * *', function() {

        console.log("Running indexing cron job every hour.");

        // Index all peers
        server.models.peer.find({include: 'profiles'}, function (err, peerInstances) {
            makebulk(peerInstances, 'peer', 'none', function(response){
                console.log("Indexing Peers: " + JSON.stringify(response));
                if(response.length > 0) {
                    indexall(response, 'peer', function(response){
                        console.log(response);
                    });
                }
            });
        });

        // Index all collections
        server.models.collection.find(function (err, collectionInstances) {
            makebulk(collectionInstances, 'collection', 'type', function(response){
                console.log("Indexing Collections: " + JSON.stringify(response));
                if(response.length > 0) {
                    indexall(response, 'collection', function(response){
                        console.log(response);
                    });
                }
            });
        });

        // Index all contents
        server.models.content.find(function (err, contentInstance) {
            makebulk(contentInstance, 'content', 'type', function(response){
                console.log("Indexing Contents: " + JSON.stringify(response));
                if(response.length > 0) {
                    indexall(response, 'content', function(response){
                        console.log(response);
                    });
                }
            });
        });

        // Index all topics
        server.models.topic.find(function (err, topicInstances) {
            makebulk(topicInstances, 'topic', 'none', function(response){
                console.log("Indexing Topics: " + JSON.stringify(response));
                if(response.length > 0) {
                    indexall(response, 'topic', function(response){
                        console.log(response);
                    });
                }
            });
        });

        // Index all contacts
        server.models.contact.find(function (err, contactInstances) {
            makebulk(contactInstances, 'contact', 'provider', function(response){
                console.log("Indexing Contacts: " + JSON.stringify(response));
                if(response.length > 0) {
                    indexall(response, 'contact', function(response){
                        console.log(response);
                    });
                }
            });
        });

    }, function() {
        // Callback function when job ends.
    },
    true,
    'UTC'
    );

    var collectionCompleteCron = new CronJob('*/20 * * * * *',
        function() {
            console.log('Running collectionCompleteCron every minute');
            server.models.collection.find({'where': {'status': 'active'}, 'include': ['calendars']}, function(err, collectionInstances){
               collectionInstances.forEach(collection => {
                   if (collection.toJSON().calendars !== undefined) {
                       collection.toJSON().calendars.forEach(calendar => {
                           var collectionCalendarEndDate = moment(calendar.endDate);
                           var now = moment();
                           if (calendar.status !== 'complete' && collectionCalendarEndDate.diff(now) <= 0) {
                               //console.log('Collection ' + collection.title + ' - cohort ending ' + calendar.endDate + ' is completed. Send out emails to student and teacher');
                               // Mark the calendar as complete
                               // Send email to student asking to review the teacher
                               // Send notification to student asking to review teacher
                               // Send email to teacher asking to review all students
                               // Send notification to teacher asking to review students
                               // Initiate payouts to teacher

                           }
                       });
                   }
               });
            });
        },
        function() {

    },
        true,
        'UTC'
    );
};
