'use strict';
let loopback = require('loopback');
let path = require('path');
let g = require('../../node_modules/loopback/lib/globalize');
const request = require('request');

module.exports = function (Collection) {
	
    Collection.afterRemote('prototype.__link__participants', function (ctx, participantInstance, next) {
        // New participant added to collection. Notify collection owner.
        let collectionInstance = ctx.instance;
        Collection.app.models.peer.findById(participantInstance.sourceId, {"include": "profiles"}, function(err, participantUserInstance) {
            if (err) {
                next(err);
            }
            else {
                // Link all topics of this collection to the participant as topics learning
                collectionInstance.__get__topics({}, function (err, topicInstances) {
                    if (!err) {
                        topicInstances.forEach(topicInstance => {
                            participantUserInstance.__link__topicsLearning(topicInstance.id, function(err1, linkedTopicInstance) {
                                if (!err1) {
                                    //console.log('Linked topic ' + topicInstance.name + ' to ' + participantUserInstance.toJSON().profiles[0].first_name);
                                }
                                else {
                                    console.log(err1);
                                }
                            });
                        })
                    }
                    else {
                        console.log(err);
                    }
                });
                collectionInstance.__get__owners({"include": "profiles"}, function(err, ownerInstances){
                    if(err) {
                        next(err);
                    }
                    else {
                        let ownerInstance = ownerInstances[0];
                        ownerInstance.__create__notifications({
                            type: "action",
                            title: "New participant!",
                            description: "%username% joined %collectionTitle%",
                            actionUrl: [collectionInstance.type,collectionInstance.id,"calendar",participantInstance.calendarId]
                        }, function(err, notificationInstance) {
                            if(err) {
                                next(err);
                            }
                            else {
                                notificationInstance.actor.add(participantInstance.sourceId, function(err, actorInstance){
                                    if(err){
                                        next(err);
                                    }
                                    else {
                                        notificationInstance.collection.add(collectionInstance.id, function(err, linkedCollectionInst){
                                            if(err) {
                                                next(err);
                                            }
                                            else {
                                                // Add this participant to the collection's chat room
                                                collectionInstance.__get__rooms({}, function(err, roomInstances) {
                                                   if (!err) {
                                                       if (roomInstances.length > 0) {
                                                           roomInstances[0].__link__participants(participantUserInstance.id, function(err, linkedParticipantInstance) {
                                                               if (!err) {
                                                                   console.log('Added participant to chat room');
                                                                   // Add a new system message about new participant
                                                                   let messageObject = {
                                                                       text: participantUserInstance.toJSON().profiles[0].first_name + " " + participantUserInstance.toJSON().profiles[0].last_name + " joined ",
                                                                       type: 'system'
                                                                   };
                                                                   roomInstances[0].__create__messages(messageObject, function(err, newMessageInstance) {
                                                                       if (!err) {
                                                                           Collection.app.io.in(roomInstances[0].id).emit('message', newMessageInstance.toJSON());
	
                                                                           // Record this on blockchain
                                                                           request
                                                                                   .put({
                                                                                       url: Collection.app.get('protocolUrl') + 'collections/' + collectionInstance.id + '/peers/rel/' + participantUserInstance.ethAddress,
                                                                                       body: {
                                                                                           scholarshipId: ctx.req.body.scholarshipId
                                                                                       },
                                                                                       json: true
                                                                                    }, function (err, response, data) {
                                                                                       if (err) {
	                                                                                       console.error(err);
	                                                                                       next(err);
                                                                                       } else {
	                                                                                       console.log('Recorded participation on blockchain ' + data);
                                                                                       }
                                                                                   });
                                                                           
	                                                                       // Send email to the student welcoming him to course
	                                                                       let message = { type: collectionInstance.type, title: collectionInstance.title, owner: ownerInstance.toJSON().profiles[0].first_name + ' ' + ownerInstance.toJSON().profiles[0].last_name, collectionId: collectionInstance.id, calendarId: participantInstance.calendarId};
	                                                                       let renderer = loopback.template(path.resolve(__dirname, '../../server/views/newParticipantOnCollectionStudent.ejs'));
	                                                                       let html_body = renderer(message);
	                                                                       loopback.Email.send({
		                                                                       to: participantUserInstance.email,
		                                                                       from: 'Peerbuds <noreply@mx.peerbuds.com>',
		                                                                       subject: '[Welcome] ' + collectionInstance.title,
		                                                                       html: html_body
	                                                                       })
			                                                                       .then(function (response) {
				                                                                       console.log('email sent! - ');
			                                                                       })
			                                                                       .catch(function (err) {
				                                                                       console.log('email error! - ' + err);
			                                                                       });
	
	                                                                       // Send email to the teacher informing about new student
	                                                                       message = { type: collectionInstance.type, title: collectionInstance.title, student: participantUserInstance.toJSON().profiles[0].first_name + " " + participantUserInstance.toJSON().profiles[0].last_name, collectionId: collectionInstance.id, calendarId: participantInstance.calendarId};
	                                                                       renderer = loopback.template(path.resolve(__dirname, '../../server/views/newParticipantOnCollectionTeacher.ejs'));
	                                                                       html_body = renderer(message);
	                                                                       loopback.Email.send({
		                                                                       to: ownerInstance.email,
		                                                                       from: 'Peerbuds <noreply@mx.peerbuds.com>',
		                                                                       subject: 'New participant @ ' + collectionInstance.title,
		                                                                       html: html_body
	                                                                       })
			                                                                       .then(function (response) {
				                                                                       console.log('email sent! - ');
			                                                                       })
			                                                                       .catch(function (err) {
				                                                                       console.log('email error! - ' + err);
			                                                                       });
	                                                                       next();
                                                                       }
                                                                       else {
                                                                           next(new Error('Could not create system message'));
                                                                       }
                                                                   });
                                                               }
                                                               else {
                                                                   next(err);
                                                               }
                                                           });
                                                       }
                                                       else {
                                                           next();
                                                       }
                                                   }
                                                   else {
                                                       next(err);
                                                   }
                                                });
                                            }
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });
    });

    Collection.afterRemote('prototype.__create__comments', function (ctx, newCommentInstance, next) {
        // Send email to all students if an announcement is made by the teacher
        if (newCommentInstance.toJSON().isAnnouncement) {
            let loggedinPeer = Collection.getCookieUserId(ctx.req);
            if (loggedinPeer) {
                Collection.findById(ctx.instance.id, {include: [{'participants': 'profiles'}, 'owners']}, function (err, collectionInstance) {
                    if (!err) {
                        Collection.app.models.peer.findById(collectionInstance.toJSON().owners[0].id, {include: 'profiles'}, function(err, collectionOwnerInstance) {
                            if (!err) {
                                collectionInstance.toJSON().participants.forEach(participant => {
                                    // Send email to every participant
                                    let message = { studentName: participant.profiles[0].first_name, teacherName: collectionOwnerInstance.toJSON().profiles[0].first_name + ' ' + collectionOwnerInstance.toJSON().profiles[0].last_name, announcement: newCommentInstance.description, collectionTitle: collectionInstance.toJSON().title};
                                    let renderer = loopback.template(path.resolve(__dirname, '../../server/views/newAnnouncementToStudents.ejs'));
                                    let html_body = renderer(message);
                                    loopback.Email.send({
                                        to: participant.email,
                                        from: 'Peerbuds <noreply@mx.peerbuds.com>',
                                        subject: 'New announcement from teacher',
                                        html: html_body
                                    })
                                        .then(function (response) {
                                            console.log('email sent! - ' + response);
                                        })
                                        .catch(function (err) {
                                            console.log('email error! - ' + err);
                                        });
                                    next();
                                });
                            }
                            else {
                                next(new Error('Could not find collection owner'));
                            }
                        });
                    }
                    else {
                        next(new Error('Could not find collection'));
                    }
                });
            }
            else {
                next(new Error('Could not find logged in peer ID'));
            }
        }
        else {
            next();
        }
    });

    Collection.getCookieUserId = function (req) {

        let cookieArray = req.headers.cookie.split(';');
        let cookie = '';
        for (let i = 0; i < cookieArray.length; i++) {
            if (cookieArray[i].split('=')[0].trim() === 'userId') {
                cookie = cookieArray[i].split('=')[1].trim();
            }
        }
        console.log('User ID from cookie is: ' + cookie.split(/[ \:.]+/)[0]);
        return cookie.split(/[ \:.]+/)[0];
    };

    Collection.afterRemote('prototype.__unlink__participants', function (ctx, next1) {
        // Participant canceled collection. Notify collection owner.
        let collectionInstance = ctx.instance;
        let participantId = ctx.args.fk;
        Collection.app.models.peer.findById(participantId, {"include": "profiles"}, function(err, participantUserInstance) {
            if (err) {
                next1(err);
            }
            else {
                collectionInstance.__get__owners({"include": "profiles"}, function(err, ownerInstances){
                    if(err) {
                        next1(err);
                    }
                    else {
                        let ownerInstance = ownerInstances[0];
                        ownerInstance.__create__notifications({
                            type: "action",
                            title: "Cancelled participation",
                            description: "%username% cancelled participation for %collectionTitle%",
                            actionUrl: [collectionInstance.type,collectionInstance.id]
                        }, function(err, notificationInstance) {
                            if(err) {
                                next1(err);
                            }
                            else {
                                notificationInstance.actor.add(participantId, function(err, actorInstance){
                                    if(err){
                                        next1(err);
                                    }
                                    else {
                                        notificationInstance.collection.add(collectionInstance.id, function(err, linkedCollectionInst){
                                            if(err) {
                                                next(err);
                                            }
                                            else {
                                                // Send email to the confirming cancellation
                                                let message = { heading: "You have cancelled your participation for - " + collectionInstance.title + ". \n\n If you are eligible for a refund, it'll be credited to your account in 7 working days."};
                                                let renderer = loopback.template(path.resolve(__dirname, '../../server/views/notificationEmail.ejs'));
                                                let html_body = renderer(message);
                                                loopback.Email.send({
                                                    to: participantUserInstance.email,
                                                    from: 'Peerbuds <noreply@mx.peerbuds.com>',
                                                    subject: 'Participation cancelled : ' + collectionInstance.title,
                                                    html: html_body
                                                })
                                                    .then(function (response) {
                                                        console.log('email sent! - ');
                                                    })
                                                    .catch(function (err) {
                                                        console.log('email error! - ' + err);
                                                    });

                                                // Send email to the teacher informing about cancelled student
                                                message = { heading: participantUserInstance.toJSON().profiles[0].first_name + " " + participantUserInstance.toJSON().profiles[0].last_name + " has dropped out of " + collectionInstance.title};
                                                html_body = renderer(message);
                                                loopback.Email.send({
                                                    to: ownerInstance.email,
                                                    from: 'Peerbuds <noreply@mx.peerbuds.com>',
                                                    subject: 'Dropped student @ ' + collectionInstance.title,
                                                    html: html_body
                                                })
                                                    .then(function (response) {
                                                        console.log('email sent! - ');
                                                    })
                                                    .catch(function (err) {
                                                        console.log('email error! - ' + err);
                                                    });

                                                // Add this participant to the collection's chat room
                                                collectionInstance.__get__rooms({}, function(err, roomInstances) {
                                                    if (!err) {
                                                        if (roomInstances.length > 0) {
                                                            roomInstances[0].__unlink__participants(participantUserInstance.id, function(err, unlinkedParticipantInstance) {
                                                                if (!err) {
                                                                    console.log('Removed participant from room');
                                                                    // Add a new system message about new participant
                                                                    let messageObject = {
                                                                        text: participantUserInstance.toJSON().profiles[0].first_name + " " + participantUserInstance.toJSON().profiles[0].last_name + " left ",
                                                                        type: 'system'
                                                                    };
                                                                    roomInstances[0].__create__messages(messageObject, function(err, newMessageInstance) {
                                                                        if (!err) {
                                                                            Collection.app.io.in(roomInstances[0].id).emit('message', newMessageInstance.toJSON());
                                                                            ctx.res.json(participantUserInstance);
                                                                        }
                                                                        else {
                                                                            next(new Error('Could not create system message'));
                                                                        }
                                                                    });
                                                                }
                                                                else {
                                                                    next(err);
                                                                }
                                                            });
                                                        }
                                                        else {
                                                            ctx.res.json(participantUserInstance);
                                                        }

                                                    }
                                                    else {
                                                        next(err);
                                                    }
                                                });
                                            }
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });
    });


    Collection.submitForReview = function (id, req, cb) {
        // Find the collection by given ID
        Collection.findById(id, function (err, collectionInstance) {
            let loggedinPeer = Collection.app.models.peer.getCookieUserId(req);
            // if collection exists and the user is logged in
            if (!err && collectionInstance !== null) {
                //let ownerEmail = collectionInstance.toJSON().owners[0].email;
                collectionInstance.status = 'submitted';
                collectionInstance.isApproved = false;
                collectionInstance.save(function (err) {
                    if (err) {
                        console.log(err);
                        err = new Error(g.f('Error updating collection.'));
                        err.statusCode = 400;
                        err.code = 'DB_ERROR';
                        cb(err);
                    }
                    else {
                        console.log('collectionInstance updated');
                    }
                });

                let message = '', subject = '';
                message = { type: collectionInstance.type };
                switch (collectionInstance.type) {
                    case 'workshop':
                        subject = 'Workshop submitted for review';
                        break;
                    case 'experience':
                        subject = 'Experience submitted for review';
                        break;
	                case 'session':
		                subject = 'Account submitted for peer session review';
		                break;
                    default:
                        subject = 'Collection submitted for review';
                        break;
                }
                let renderer = loopback.template(path.resolve(__dirname, '../../server/views/collectionSubmitted.ejs'));
                let html_body = renderer(message);

                // Create payout rule for this collection
                Collection.app.models.peer.findById(loggedinPeer, { "include": ["payoutaccs"] },
                    function (err, peerInstance) {

                        loopback.Email.send({
                            to: peerInstance.toJSON().email,
                            from: 'Peerbuds <noreply@mx.peerbuds.com>',
                            subject: subject,
                            html: html_body
                        })
                            .then(function (response) {
                                console.log('email sent! - ');
                            })
                            .catch(function (err) {
                                console.log('email error! - ' + err);
                            });

                        let peerPayoutAccs = peerInstance.toJSON().payoutaccs;
                        if (peerPayoutAccs && peerPayoutAccs.length) {

                            peerPayoutAccs.forEach(function (payoutaccs) {

                                if (payoutaccs.is_default) {
                                    let payoutRule = {};
                                    payoutRule.percentage1 = 100;
                                    payoutRule.payoutId1 = payoutaccs.id;

                                    collectionInstance.payoutrules.create(payoutRule,
                                        function (err, payoutRulesInstance) {
                                            if (err) {
                                                payoutRulesInstance.destroy();
                                                cb(err);
                                            }
                                        });
                                }
                            });
                        }
                    });
                cb(null, 'Submitted for review. Email sent to user.');
            }
            else {
                err = new Error(g.f('Invalid Collection with ID: %s', id));
                err.statusCode = 400;
                err.code = 'INVALID_COLLECTION';
                cb(err);
            }
        });
    };


    Collection.approve = function (id, req, cb) {
        // Find the collection by given ID
        Collection.findById(id, {"include": [{"owners": "profiles"}, {"assessment_models": "assessment_rules"}, "topics"]}, function (err, collectionInstance) {
            // if collection exists and the user is logged in
            if (!err && collectionInstance !== null) {
                let ownerId = collectionInstance.toJSON().owners[0].id;
                let userId = Collection.app.models.peer.getCookieUserId(req);
                let assessmentRules = collectionInstance.toJSON().assessment_models[0].assessment_rules;
                let topics = collectionInstance.toJSON().topics;
                collectionInstance.status = 'active';
                collectionInstance.isApproved = true;
                collectionInstance.approvedBy = userId;
                delete collectionInstance.owners;
                delete collectionInstance.assessment_models;
                delete collectionInstance.topics;
                Collection.upsertWithWhere({id: collectionInstance.id}, collectionInstance, function(err, newCollectionInstance) {
                    if (err) {
                        console.log(err);
                        err = new Error(g.f('Error updating collection.'));
                        err.statusCode = 400;
                        err.code = 'DB_ERROR';
                        cb(err);
                    }
                    else {
                        let message = '', subject = '';
                        let title = '', description = '', actionUrl = [];
                        message = { type: collectionInstance.type};
                        switch (collectionInstance.type) {
                            case 'workshop':
                                subject = 'Workshop Approved';
                                title = 'Workshop Approved!';
                                description = "%collectionType% %collectionName% has been approved. Add finishing touches and invite students now.";
                                actionUrl = [collectionInstance.type,collectionInstance.id,"edit","15"];
                                break;
                            case 'experience':
                                subject = 'Experience Approved';
	                            title = 'Experience Approved!';
	                            description = "%collectionType% %collectionName% has been approved. Add finishing touches and invite students now.";
	                            actionUrl = [collectionInstance.type,collectionInstance.id,"edit","16"];
                                break;
	                        case 'session':
		                        subject = 'Account Approved for Peer Sessions';
		                        title = 'Account Approved for Peer Sessions!';
		                        description = "Your account has been approved for sessions. Add finishing touches and invite students now.";
		                        actionUrl = [collectionInstance.type,collectionInstance.id,"edit","16"];
		                        break;
                            default:
                                subject = 'Collection Approved';
                                title = 'Collection Approved!';
	                            description = "%collectionType% %collectionName% has been approved. Add finishing touches and invite students now.";
	                            actionUrl = [collectionInstance.type,collectionInstance.id,"edit","16"];
                                break;
                        }
                        let renderer = loopback.template(path.resolve(__dirname, '../../server/views/collectionApproved.ejs'));
                        let html_body = renderer(message);

                        // Send email to owner of this collection
                        Collection.app.models.peer.findById(ownerId, {"include": "profiles"}, function (err, ownerInstance) {

                            if (!err) {
                                // Send notification to owner
                                ownerInstance.__create__notifications({
                                    type: "action",
                                    title: title,
                                    description: description,
                                    actionUrl: actionUrl
                                }, function(err, notificationInstance) {
                                    if(err) {
                                        cb(err);
                                    }
                                    else {
                                        notificationInstance.actor.add(ownerInstance.id, function(err, actorInstance){
                                            if(err){
                                                cb(err);
                                            }
                                            else {
                                                notificationInstance.collection.add(collectionInstance.id, function(err, linkedCollectionInst){
                                                    if(err) {
                                                        cb(err);
                                                    }
                                                    else {
                                                        if (collectionInstance.type === 'session') {
	                                                        cb(null, { result: 'Collection approved. Email sent to owner.' });
                                                        }
                                                        else {
	                                                        // Create a new chat room for this collection
	                                                        let roomValue =  {
		                                                        name: collectionInstance.title
	                                                        };
	                                                        collectionInstance.rooms.create(roomValue, function(err, newRoomInstance) {
		                                                        if (!err) {
			                                                        console.log('New chat room created for this collection');
			                                                        // Add teacher to the collection's new chat room
			                                                        newRoomInstance.__link__participants(ownerInstance.id, function(err, linkedParticipantInstance) {
				                                                        if (!err) {
					                                                        console.log('Added teacher to chat room');
					                                                        // Add a new system message about new participant
					                                                        let messageObject = {
						                                                        text: ownerInstance.toJSON().profiles[0].first_name + " " + ownerInstance.toJSON().profiles[0].last_name + " joined ",
						                                                        type: 'system'
					                                                        };
					                                                        newRoomInstance.__create__messages(messageObject, function(err, newMessageInstance) {
						                                                        if (!err) {
							                                                        Collection.app.io.in(newRoomInstance.id).emit('message', newMessageInstance.toJSON());
							                                                        
							                                                        // Add this collection to blockchain.
                                                                                    const assessmentRuleKeys = [];
                                                                                    const assessmentRuleValues = [];
                                                                                    const topicArray = [];
                                                                                    assessmentRules.forEach(assessmentRule => {
                                                                                        assessmentRuleKeys.push(assessmentRule.value);
                                                                                        assessmentRuleValues.push(assessmentRule.gyan);
                                                                                    });
							                                                        topics.forEach(topic => {
								                                                        topicArray.push(topic.name);
							                                                        });
							                                                        
                                                                                    // Add to blockchain
                                                                                    request
									                                                        .post({
										                                                        url: Collection.app.get('protocolUrl') + 'collections',
										                                                        body: {
											                                                        uniqueId: collectionInstance.id,
											                                                        teacherAddress: ownerInstance.ethAddress,
											                                                        type: collectionInstance.type,
											                                                        activityHash: 'NA',
											                                                        academicGyan: collectionInstance.academicGyan,
											                                                        nonAcademicGyan: collectionInstance.nonAcademicGyan,
											                                                        assessmentRuleKeys: assessmentRuleKeys,
											                                                        assessmentRuleValues: assessmentRuleValues,
											                                                        topics: topicArray
										                                                        },
										                                                        json: true
									                                                        }, function (err, response, data) {
									                                                            if (err) {
										                                                            console.error(err);
                                                                                                } else {
										                                                            console.log('Add collection to blockchain: ' + data);
                                                                                                }
                                                                                            });
							
							                                                        cb(null, { result: 'Collection approved. Email sent to owner.' });
						                                                        }
						                                                        else {
							                                                        cb(new Error('Could not create system message'));
						                                                        }
					                                                        });
				                                                        }
				                                                        else {
					                                                        cb(err);
				                                                        }
			                                                        });
		                                                        }
		                                                        else {
			                                                        cb(err);
		                                                        }
	                                                        });
                                                        }
                                                    }
                                                });
                                            }
                                        });
                                    }
                                });

                                loopback.Email.send({
                                    to: ownerInstance.email,
                                    from: 'Peerbuds <noreply@mx.peerbuds.com>',
                                    subject: subject,
                                    html: html_body
                                })
                                    .then(function (response) {
                                        console.log('email sent! - ');
                                    })
                                    .catch(function (err) {
                                        console.log('email error! - ' + err);
                                    });
                            }
                            else {
                                cb(err);
                            }
                        });
                    }
                });
            }
            else {
                err = new Error(g.f('Invalid Collection with ID: %s', id));
                err.statusCode = 400;
                err.code = 'INVALID_COLLECTION';
                cb(err);
            }
        });
    };

    Collection.reject = function (id, req, cb) {
        // Find the collection by given ID
        Collection.findById(id, {"include": {"owners": "profiles"}}, function (err, collectionInstance) {
            // if collection exists and the user is logged in
            if (!err && collectionInstance !== null) {
                let ownerId = collectionInstance.toJSON().owners[0].id;
                let userId = Collection.app.models.peer.getCookieUserId(req);
                collectionInstance.status = 'draft';
                collectionInstance.isApproved = false;
                collectionInstance.approvedBy = '';
                delete collectionInstance.owners;
                Collection.upsertWithWhere({id: collectionInstance.id}, collectionInstance, function(err, newCollectionInstance) {
                    if (err) {
                        console.log(err);
                        err = new Error(g.f('Error updating collection.'));
                        err.statusCode = 400;
                        err.code = 'DB_ERROR';
                        cb(err);
                    }
                    else {
                        let message = '', subject = '';
                        let title = '', description = '', actionUrl = [];
                        message = { type: collectionInstance.type};
                        switch (collectionInstance.type) {
	                        case 'workshop':
		                        subject = 'Workshop Rejected';
		                        title = 'Workshop Rejected!';
		                        description = "%collectionType% %collectionName% has been rejected. Edit your details and submit again.";
		                        actionUrl = [collectionInstance.type,collectionInstance.id,"edit","13"];
		                        break;
	                        case 'experience':
		                        subject = 'Experience Rejected';
		                        title = 'Experience Rejected!';
		                        description = "%collectionType% %collectionName% has been rejected. Edit your details and submit again.";
		                        actionUrl = [collectionInstance.type,collectionInstance.id,"edit","14"];
		                        break;
	                        case 'session':
		                        subject = 'Account Rejected for Peer Sessions';
		                        title = 'Account Rejected for Peer Sessions!';
		                        description = "Your account has been rejected for peer sessions. Edit your details and submit again.";
		                        actionUrl = [collectionInstance.type,collectionInstance.id,"edit","15"];
		                        break;
	                        default:
		                        subject = 'Collection Rejected';
		                        title = 'Collection Rejected!';
		                        description = "%collectionType% %collectionName% has been rejected. Edit your details and submit again.";
		                        actionUrl = [collectionInstance.type,collectionInstance.id,"edit","14"];
		                        break;
                        }
                        let renderer = loopback.template(path.resolve(__dirname, '../../server/views/collectionRejected.ejs'));
                        let html_body = renderer(message);

                        // Send email to owner of this workshop
                        Collection.app.models.peer.findById(ownerId, {"include": "profiles"}, function (err, ownerInstance) {

                            if (!err) {
                                // Send notification to owner
                                ownerInstance.__create__notifications({
                                    type: "action",
                                    title: title,
                                    description: description,
                                    actionUrl: actionUrl
                                }, function(err, notificationInstance) {
                                    if(err) {
                                        cb(err);
                                    }
                                    else {
                                        notificationInstance.actor.add(ownerInstance.id, function(err, actorInstance){
                                            if(err){
                                                cb(err);
                                            }
                                            else {
                                                notificationInstance.collection.add(collectionInstance.id, function(err, linkedCollectionInst){
                                                    if(err) {
                                                        cb(err);
                                                    }
                                                    else {
                                                        cb(null, { result: 'Collection rejected. Email sent to owner.' });
                                                    }
                                                });
                                            }
                                        });
                                    }
                                });

                                loopback.Email.send({
                                    to: ownerInstance.email,
                                    from: 'Peerbuds <noreply@mx.peerbuds.com>',
                                    subject: subject,
                                    html: html_body
                                })
                                    .then(function (response) {
                                        console.log('email sent! - ');
                                    })
                                    .catch(function (err) {
                                        console.log('email error! - ' + err);
                                    });
                            }
                            else {
                                cb(err);
                            }
                        });
                    }
                });
            }
            else {
                err = new Error(g.f('Invalid Collection with ID: %s', id));
                err.statusCode = 400;
                err.code = 'INVALID_COLLECTION';
                cb(err);
            }
        });
    };


    Collection.beforeRemote('prototype.patchAttributes', function (ctx, newInstance, next) {
        let collectionInstance = ctx.instance;
        if (collectionInstance.status === 'draft' || collectionInstance.status === "" || collectionInstance.status === "submitted") {
            next();
        }
        else if (ctx.args.data.status === 'complete') {
            next();
        }
        else if (ctx.args.data.status === 'cancelled') {
            // cancelling a workshop with participants.
            collectionInstance.__get__participants({ "relInclude": "calendarId" }, function (err, participantInstances) {
                if (err) {
                    next(err);
                }
                else if (participantInstances !== null && participantInstances.length > 0) {
                    //Inform all participants that the workshop is cancelled.
                    participantInstances.forEach((participantInstance) => {
                        // Send email to participants
                        let message = { heading: "Your " + collectionInstance.type + " : " + collectionInstance.title + " has been cancelled by the teacher. If you are eligible for refund, your account will be credited within 7 working days."};
                        let renderer = loopback.template(path.resolve(__dirname, '../../server/views/notificationEmail.ejs'));
                        let html_body = renderer(message);
                        loopback.Email.send({
                            to: participantInstance.email,
                            from: 'Peerbuds <noreply@mx.peerbuds.com>',
                            subject: collectionInstance.type + ' cancelled : ' + collectionInstance.title,
                            html: html_body
                        })
                            .then(function (response) {
                                console.log('email sent! - ');
                            })
                            .catch(function (err) {
                                console.log('email error! - ' + err);
                            });
                    });
                    next();
                }
                else {
                    next();
                }
            });
        }
        else {
            // User is trying to update a non draft collection
            // We need to check if this collection is active and if it has any participants.
            if (collectionInstance.status === 'active') {
                collectionInstance.__get__participants({ "relInclude": "calendarId" }, function (err, participantInstances) {
                    if (err) {
                        next(err);
                    }
                    else if (participantInstances !== null && participantInstances.length > 0) {
                        // This collection has existing participants on it. It cannot be edited without branching out.
                        // Create a new collection by copying all the data of this collection
                        let newCollection = collectionInstance.toJSON();

                        let updatedContentKeys = Object.keys(ctx.args.data);
                        updatedContentKeys.forEach(function (updatedContentKey) {
                            newCollection[updatedContentKey] = ctx.args.data[updatedContentKey];
                        });

                        newCollection.title = 'Cloned: ' + newCollection.title;
                        newCollection.disableHasOneCreate = true;

                        delete newCollection.id;
                        delete newCollection.status;
                        delete newCollection.isCanceled;
                        delete newCollection.createdAt;
                        delete newCollection.updatedAt;
                        delete newCollection.isApproved;
                        delete newCollection.isNewInstance;

                        Collection.create(newCollection, function (err, newCollectionInstance) {
                            if (err) {
                                next(err);
                            }
                            else {
                                delete ctx.args.data;
                                ctx.args.data = {};
                                newCollectionInstance.isNewInstance = true;

                                // Create a relation between logged in user and this new collection node
                                collectionInstance.__get__owners(function (err, oldOwnerInstances) {
                                    if (!err && oldOwnerInstances !== null) {
                                        oldOwnerInstances.forEach(function (oldOwnerInstance) {
                                            newCollectionInstance.__link__owners(oldOwnerInstance.id, function (err, ownerLinkInstance) {
                                                if (!err && ownerLinkInstance !== null) {
                                                    console.log('Linked owner to cloned collection.');
                                                }
                                                else {
                                                    next(err);
                                                }
                                            });
                                        });
                                    }
                                    else {
                                        next(err);
                                    }
                                });

                                // Copy all contents from oldInstance to new instance
                                collectionInstance.__get__contents({ "include": ["schedules", "locations"] }, function (err, oldContentInstances) {
                                    if (!err && oldContentInstances !== null) {
                                        oldContentInstances.forEach(function (oldContentInstance) {
                                            // Link new clone to all existing contents.
                                            newCollectionInstance.__link__contents(oldContentInstance.id, function (err, newLinkedContentInstance) {
                                                if (!err && newLinkedContentInstance !== null) {
                                                    console.log('Linked content to collection');
                                                }
                                            });
                                        });
                                    }
                                    else {
                                        console.log(err);
                                    }
                                });

                                // Copy calendars from old collection to new collection
                                collectionInstance.__get__calendars(function (err, oldCalendarInstances) {
                                    if (!err && oldCalendarInstances !== null) {
                                        let hasOneCalendarCopied = false;
                                        oldCalendarInstances.forEach(function (oldCalendarInstance) {
                                            let hasParticipant = participantInstances.some(function (participantInstance) {
                                                return participantInstance.calendarId === oldCalendarInstance.id;
                                            });
                                            // If this calendar has no participant signed up
                                            if (!hasParticipant) {
                                                hasOneCalendarCopied = true;
                                                newCollectionInstance.__link__calendars(oldCalendarInstance.id, function (err, copiedCalendarInstance) {
                                                    // Do nothing here.
                                                    console.log('Linked calendar to new collection');
                                                });
                                                collectionInstance.__unlink__calendars(oldCalendarInstance.id, function (err, deletedCalendarInstance) {
                                                    console.log('unlinked calendar from old collection');
                                                });
                                            }
                                            else {
                                                console.log('Skipped moving calendar with participants');
                                            }
                                        });
                                        if (!hasOneCalendarCopied) {
                                            // If no calendar was copied to new instance, we need to link one of the existing calendars to this instance
                                            newCollectionInstance.__link__calendars(oldCalendarInstances[oldCalendarInstances.length - 1].id, function (err, copiedCalendarInstance) {
                                                // Do nothing here.
                                                console.log('Linked calendar to new collection');
                                            });
                                        }
                                    }
                                });

                                // Copy topics from old collection to new collection
                                collectionInstance.__get__topics(function (err, oldTopicInstances) {
                                    if (!err && oldTopicInstances !== null) {
                                        oldTopicInstances.forEach(function (oldTopicInstance) {
                                            newCollectionInstance.__link__topics(oldTopicInstance.id, function (err, copiedTopicInstance) {
                                                // Do nothing here.
                                                console.log('Copied topic for new collection');
                                            });

                                        });
                                    }
                                });

                                ctx.res.json(newCollectionInstance.toJSON());
                            }
                        });
                    }
                    else {
                        // This collection has no participants on it. We can edit it but put it back in draft status.
                        ctx.args.data.status = 'draft';
                        ctx.args.data.isNewInstance = true;
                        next();
                    }
                });
            }
            else {
                // Collection status is neither draft or active.
                next(new Error(g.f('Cannot update collection in state: ' + collectionInstance.status)));
            }
        }
    });


    Collection.beforeRemote('prototype.__updateById__contents', function (ctx, newInstance, next)   {
        let collectionInstance = ctx.instance;
        /*console.log('received instance is: ' + JSON.stringify(collectionInstance));
        console.log("ctx args are: " + JSON.stringify(ctx.args));
        console.log("ctx method is: " + JSON.stringify(ctx.methodString));*/
        if (collectionInstance.status === 'draft' || collectionInstance.status === '' || collectionInstance.status === 'submitted') {
            next();
        }
        else if (ctx.args.data.status === 'complete') {
            next();
        }
        else {
            // User is trying to update a non draft collection
            // We need to check if this collection is active and if it has any participants.
            if (collectionInstance.status === 'active') {
                collectionInstance.__get__participants({ "relInclude": "calendarId" }, function (err, participantInstances) {
                    if (err) {
                        next(err);
                    }
                    else if (participantInstances !== null && participantInstances.length > 0) {

                        // This collection has existing participants on it. It cannot be edited without branching out.

                        // Create a new collection by copying all the data of this collection
                        let newCollection = collectionInstance.toJSON();
                        delete newCollection.id;
                        delete newCollection.status;
                        delete newCollection.isCanceled;
                        delete newCollection.createdAt;
                        delete newCollection.updatedAt;
                        delete newCollection.isApproved;
                        delete newCollection.isNewInstance;
                        newCollection.title = 'Cloned: ' + newCollection.title;
                        newCollection.disableHasOneCreate = true;

                        Collection.create(newCollection, function (err, newCollectionInstance) {
                            if (err) {
                                next(err);
                            }
                            else {
                                newCollectionInstance.isNewInstance = true;

                                // Get all owners of this collection and link them to cloned collection
                                collectionInstance.__get__owners(function (err, oldOwnerInstances) {
                                    if (!err && oldOwnerInstances !== null) {
                                        oldOwnerInstances.forEach(function (oldOwnerInstance) {
                                            newCollectionInstance.__link__owners(oldOwnerInstance.id, function (err, ownerLinkInstance) {
                                                if (!err && ownerLinkInstance !== null) {
                                                    console.log('Linked owner to cloned collection.');
                                                }
                                            });
                                        });
                                    }
                                });

                                let resultContents = [];

                                // Copy all contents from oldInstance to new instance
                                collectionInstance.__get__contents({ "include": ["schedules", "locations"] }, function (err, oldContentInstances) {
                                    if (!err && oldContentInstances !== null) {
                                        let m = 0;
                                        for (let i = 0; i < oldContentInstances.length; i++) {
                                            // If this content is not a dirty content
                                            if (oldContentInstances[i].id !== ctx.args.fk) {
                                                // Add content to array to pass in result
                                                resultContents.push(oldContentInstances[i]);
                                                // Link new clone to all non-dirty contents.
                                                newCollectionInstance.__link__contents(oldContentInstances[i].id, function (err, newLinkedContentInstance) {
                                                    if (!err && newLinkedContentInstance !== null) {
                                                        console.log('Linked non-dirty content to collection');
                                                    }
                                                    m++;
                                                    if (m === oldContentInstances.length) {
                                                        let resultCollectionInstance = newCollectionInstance.toJSON();
                                                        resultCollectionInstance['contents'] = resultContents;
                                                        ctx.res.json(resultCollectionInstance);
                                                    }
                                                });
                                            }
                                            // If this content is a dirty content.
                                            else {
                                                let newContent = {};
                                                newContent = oldContentInstances[i].toJSON();

                                                let updatedContentKeys = Object.keys(ctx.args.data);
                                                updatedContentKeys.forEach(function (updatedContentKey) {
                                                    newContent[updatedContentKey] = ctx.args.data[updatedContentKey];
                                                });

                                                delete newContent.id;
                                                delete newContent.schedules;
                                                delete newContent.locations;
                                                newContent.disableHasOneCreate = true;
                                                newContent.isNewInstance = true;

                                                // Create clone of dirty content for new collection
                                                newCollectionInstance.__create__contents(newContent, function (err, newCreatedContentInstance) {
                                                    if (!err && newCreatedContentInstance !== null) {
                                                        console.log('Cloned content for collection');
                                                        let oldContentInstance = oldContentInstances[m].__data;

                                                        // Add content to array to pass in result
                                                        resultContents.push(newCreatedContentInstance);

                                                        // Copy locations from old content to new content
                                                        let newContentLocation = oldContentInstance.locations[0].toJSON();
                                                        if (typeof newContentLocation === 'object' && newContentLocation !== undefined) {
                                                            delete newContentLocation.id;
                                                            newCreatedContentInstance.__create__locations(newContentLocation, function (err, copiedLocationInstance) {
                                                                // Do nothing here.
                                                                console.log('Cloned location for content');
                                                            });
                                                        }


                                                        // Copy schedules from old content to new content
                                                        let newContentSchedule = oldContentInstance.schedules[0].toJSON();
                                                        if (typeof newContentSchedule === 'object' && newContentSchedule !== undefined) {
                                                            delete newContentSchedule.id;
                                                            newCreatedContentInstance.__create__schedules(newContentSchedule, function (err, copiedScheduleInstance) {
                                                                // Do nothing here.
                                                                console.log('Cloned schedule for content');
                                                            });
                                                        }

                                                    }
                                                    m++;
                                                    if (m === oldContentInstances.length) {
                                                        let resultCollectionInstance = newCollectionInstance.toJSON();
                                                        resultCollectionInstance['contents'] = resultContents;
                                                        ctx.res.json(resultCollectionInstance);
                                                    }
                                                });
                                            }
                                        }
                                    }
                                    else {
                                        console.log(err);
                                        next(new Error(g.f('Cannot update collection. Error: ' + err)));
                                    }
                                });

                                // Copy calendars from old collection to new collection
                                collectionInstance.__get__calendars(function (err, oldCalendarInstances) {
                                    if (!err && oldCalendarInstances !== null) {
                                        let hasOneCalendarCopied = false;
                                        oldCalendarInstances.forEach(function (oldCalendarInstance) {
                                            //participantInstances = participantInstances.toJSON();
                                            let hasParticipant = participantInstances.some(function (participantInstance) {
                                                return participantInstance.calendarId === oldCalendarInstance.id;
                                            });
                                            // If this calendar has no participant signed up
                                            if (!hasParticipant) {
                                                hasOneCalendarCopied = true;
                                                newCollectionInstance.__link__calendars(oldCalendarInstance.id, function (err, copiedCalendarInstance) {
                                                    // Do nothing here.
                                                    console.log('Linked calendar to new collection');
                                                });
                                                collectionInstance.__unlink__calendars(oldCalendarInstance.id, function (err, deletedCalendarInstance) {
                                                    console.log('Unlinked calendar from old collection');
                                                });
                                            }
                                            else {
                                                console.log('Skipped cloning calendar with participants');
                                            }
                                        });
                                        if (!hasOneCalendarCopied) {
                                            // If no calendar was copied to new instance, we need to link one of the existing calendars to this instance
                                            newCollectionInstance.__link__calendars(oldCalendarInstances[oldCalendarInstances.length - 1].id, function (err, copiedCalendarInstance) {
                                                // Do nothing here.
                                                console.log('Linked calendar to new collection');
                                            });
                                        }
                                    }
                                });

                                // Copy topics from old collection to new collection
                                collectionInstance.__get__topics(function (err, oldTopicInstances) {
                                    if (!err && oldTopicInstances !== null) {
                                        oldTopicInstances.forEach(function (oldTopicInstance) {
                                            newCollectionInstance.__link__topics(oldTopicInstance.id, function (err, copiedTopicInstance) {
                                                // Do nothing here.
                                                console.log('Copied topic for new collection');
                                            });

                                        });
                                    }
                                });

                                // Copy payoutrules from old collection to new collection
                                collectionInstance.__get__payoutrules(function (err, oldPayoutInstances) {
                                    if (!err && oldPayoutInstances !== null) {
                                        oldPayoutInstances.forEach(function (oldPayoutInstance) {
                                            newCollectionInstance.__link__payoutrules(oldPayoutInstance.id, function (err, copiedPayoutInstance) {
                                                // Do nothing here.
                                                console.log('Copied payoutrules for new collection');
                                            });

                                        });
                                    }
                                });
                            }
                        });
                    }
                    else {
                        // This collection has no participants on it. We can edit it but put it back in draft status.
                        ctx.args.data.status = 'draft';
                        ctx.args.data.isNewInstance = true;
                        next();
                    }
                });
            }
            else {
                // Collection status is neither draft or active.
                next(new Error(g.f('Cannot update collection in state: ' + collectionInstance.status)));
            }
        }
    });

    Collection.beforeRemote('prototype.__create__contents', function (ctx, newInstance, next)   {
        console.log('***** ADDING NEW CONTENT TO ACTIVE COLLECTION');
        let collectionInstance = ctx.instance;
        if (collectionInstance.status === 'draft' || collectionInstance.status === '' || collectionInstance.status === 'submitted') {
            next();
        }
        else if (ctx.args.data.status === 'complete') {
            next();
        }
        else {
            // User is trying to update a non draft collection
            // We need to check if this collection is active and if it has any participants.
            if (collectionInstance.status === 'active') {
                collectionInstance.__get__participants({ "relInclude": "calendarId" }, function (err, participantInstances) {
                    if (err) {
                        next(err);
                    }
                    else if (participantInstances !== null && participantInstances.length > 0) {
                        // This collection has existing participants on it. It cannot be edited without branching out.

                        // Create a new collection by copying all the data of this collection
                        let newCollection = collectionInstance.toJSON();
                        delete newCollection.id;
                        delete newCollection.status;
                        delete newCollection.isCanceled;
                        delete newCollection.createdAt;
                        delete newCollection.updatedAt;
                        delete newCollection.isApproved;
                        delete newCollection.isNewInstance;
                        newCollection.title = 'Cloned: ' + newCollection.title;
                        newCollection.disableHasOneCreate = true;

                        Collection.create(newCollection, function (err, newCollectionInstance) {
                            if (err) {
                                next(err);
                            }
                            else {
                                newCollectionInstance.isNewInstance = true;

                                // Get all owners of this collection and link them to cloned collection
                                collectionInstance.__get__owners(function (err, oldOwnerInstances) {
                                    if (!err && oldOwnerInstances !== null) {
                                        oldOwnerInstances.forEach(function (oldOwnerInstance) {
                                            newCollectionInstance.__link__owners(oldOwnerInstance.id, function (err, ownerLinkInstance) {
                                                if (!err && ownerLinkInstance !== null) {
                                                    console.log('Linked owner to cloned collection.');
                                                }
                                            });
                                        });
                                    }
                                });

                                let resultContents = [];


                                // Copy all contents from oldInstance to new instance
                                collectionInstance.__get__contents({ "include": ["schedules", "locations"] }, function (err, oldContentInstances) {
                                    if (!err && oldContentInstances !== null) {
                                        let m = 0;
                                        for (let i = 0; i < oldContentInstances.length; i++) {
                                            // Link new clone to all non-dirty contents.
                                            newCollectionInstance.__link__contents(oldContentInstances[i].id, function (err, newLinkedContentInstance) {
                                                if (!err && newLinkedContentInstance !== null) {
                                                    console.log('Linked existing content to collection');
                                                    // Add content to array to pass as result
                                                    resultContents.push(newLinkedContentInstance.toJSON());
                                                }
                                                m++;
                                            });
                                            if (m === oldContentInstances.length) {

                                                // Create new content for this collection
                                                let newContent = {};
                                                let updatedContentKeys = Object.keys(ctx.args.data);
                                                updatedContentKeys.forEach(function (updatedContentKey) {
                                                    newContent[updatedContentKey] = ctx.args.data[updatedContentKey];
                                                });
                                                newContent.isNewInstance = true;
                                                // Create new content for this new collection
                                                newCollectionInstance.__create__contents(newContent, function (err, newCreatedContentInstance) {
                                                    if (!err && newCreatedContentInstance !== null) {
                                                        console.log('Created content for collection');
                                                        // Add content to array to pass as result
                                                        resultContents.push(newCreatedContentInstance.toJSON());
                                                        // Sent result response
                                                        let resultCollectionInstance = newCollectionInstance.toJSON();
                                                        resultCollectionInstance['contents'] = resultContents;
                                                        ctx.res.json(resultCollectionInstance);
                                                    }
                                                    else {
                                                        next(new Error(g.f('Cannot update collection. Error: ' + err)));
                                                    }
                                                });
                                            }
                                        }
                                    }
                                    else {
                                        console.log(err);
                                        next(new Error(g.f('Cannot update collection. Error: ' + err)));
                                    }
                                });

                                // Copy calendars from old collection to new collection
                                collectionInstance.__get__calendars(function (err, oldCalendarInstances) {
                                    if (!err && oldCalendarInstances !== null) {
                                        let hasOneCalendarCopied = false;
                                        oldCalendarInstances.forEach(function (oldCalendarInstance) {
                                            //participantInstances = participantInstances.toJSON();
                                            let hasParticipant = participantInstances.some(function (participantInstance) {
                                                return participantInstance.calendarId === oldCalendarInstance.id;
                                            });
                                            // If this calendar has no participant signed up
                                            if (!hasParticipant) {
                                                hasOneCalendarCopied = true;
                                                newCollectionInstance.__link__calendars(oldCalendarInstance.id, function (err, copiedCalendarInstance) {
                                                    // Do nothing here.
                                                    console.log('Linked calendar to new collection');
                                                });
                                                collectionInstance.__unlink__calendars(oldCalendarInstance.id, function (err, deletedCalendarInstance) {
                                                    console.log('Unlinked calendar from old collection');
                                                });
                                            }
                                            else {
                                                console.log('Skipped cloning calendar with participants');
                                            }
                                        });
                                        if (!hasOneCalendarCopied) {
                                            // If no calendar was copied to new instance, we need to link one of the existing calendars to this instance
                                            newCollectionInstance.__link__calendars(oldCalendarInstances[oldCalendarInstances.length - 1].id, function (err, copiedCalendarInstance) {
                                                // Do nothing here.
                                                console.log('Linked calendar to new collection');
                                            });
                                        }
                                    }
                                });

                                // Copy topics from old collection to new collection
                                collectionInstance.__get__topics(function (err, oldTopicInstances) {
                                    if (!err && oldTopicInstances !== null) {
                                        oldTopicInstances.forEach(function (oldTopicInstance) {
                                            newCollectionInstance.__link__topics(oldTopicInstance.id, function (err, copiedTopicInstance) {
                                                // Do nothing here.
                                                console.log('Copied topic for new collection');
                                            });

                                        });
                                    }
                                });

                                // Copy payoutrules from old collection to new collection
                                collectionInstance.__get__payoutrules(function (err, oldPayoutInstances) {
                                    if (!err && oldPayoutInstances !== null) {
                                        oldPayoutInstances.forEach(function (oldPayoutInstance) {
                                            newCollectionInstance.__link__payoutrules(oldPayoutInstance.id, function (err, copiedPayoutInstance) {
                                                // Do nothing here.
                                                console.log('Copied payoutrules for new collection');
                                            });

                                        });
                                    }
                                });
                            }
                        });
                    }
                    else {
                        // This collection has no participants on it. We can edit it but put it back in draft status.
                        ctx.args.data.status = 'draft';
                        ctx.args.data.isNewInstance = true;
                        next();
                    }
                });
            }
            else {
                // Collection status is neither draft or active.
                next(new Error(g.f('Cannot update collection in state: ' + collectionInstance.status)));
            }
        }
    });

    Collection.beforeRemote('prototype.__destroyById__contents', function (ctx, newInstance, next)   {
        console.log('***** DELETING CONTENT OF COLLECTION');
        let collectionInstance = ctx.instance;
        if (collectionInstance.status === 'draft' || collectionInstance.status === '' || collectionInstance.status === 'submitted') {
            next();
        }
        else {
            // User is trying to delete a non draft collection
            // We need to check if this collection is active and if it has any participants.
            if (collectionInstance.status === 'active') {
                console.log('***** DELETING CONTENT OF ACTIVE COLLECTION');
                collectionInstance.__get__participants({ "relInclude": "calendarId" }, function (err, participantInstances) {
                    if (err) {
                        next(err);
                    }
                    else if (participantInstances !== null && participantInstances.length > 0) {
                        console.log('***** DELETING CONTENT OF ACTIVE COLLECTION WITH PARTICIPANTS');

                        // This collection has existing participants on it. It cannot be edited without branching out.

                        // Create a new collection by copying all the data of this collection
                        let newCollection = collectionInstance.toJSON();
                        delete newCollection.id;
                        delete newCollection.status;
                        delete newCollection.isCanceled;
                        delete newCollection.createdAt;
                        delete newCollection.updatedAt;
                        delete newCollection.isApproved;
                        delete newCollection.isNewInstance;
                        newCollection.title = 'Cloned: ' + newCollection.title;
                        newCollection.disableHasOneCreate = true;

                        Collection.create(newCollection, function (err, newCollectionInstance) {
                            if (err) {
                                next(err);
                            }
                            else {
                                newCollectionInstance.isNewInstance = true;

                                // Get all owners of this collection and link them to cloned collection
                                collectionInstance.__get__owners(function (err, oldOwnerInstances) {
                                    if (!err && oldOwnerInstances !== null) {
                                        oldOwnerInstances.forEach(function (oldOwnerInstance) {
                                            newCollectionInstance.__link__owners(oldOwnerInstance.id, function (err, ownerLinkInstance) {
                                                if (!err && ownerLinkInstance !== null) {
                                                    console.log('Linked owner to cloned collection.');
                                                }
                                            });
                                        });
                                    }
                                });

                                let resultContents = [];

                                // Copy all contents from oldInstance to new instance
                                collectionInstance.__get__contents({ "include": ["schedules", "locations"] }, function (err, oldContentInstances) {
                                    if (!err && oldContentInstances !== null) {
                                        let m = 0;
                                        for (let i = 0; i < oldContentInstances.length; i++) {

                                            if (oldContentInstances[i].id !== ctx.args.fk) {
                                                // Add content to array to pass as result
                                                // Link new clone to all non-dirty contents.
                                                newCollectionInstance.__link__contents(oldContentInstances[i].id, function (err, newLinkedContentInstance) {
                                                    if (!err && newLinkedContentInstance !== null) {
                                                        console.log('Linked existing content to collection');
                                                        resultContents.push(newLinkedContentInstance.toJSON());
                                                    }
                                                    m++;
                                                    if (m === (oldContentInstances.length - 1)) {
                                                        let resultCollectionInstance = newCollectionInstance.toJSON();
                                                        resultCollectionInstance['contents'] = resultContents;
                                                        ctx.res.json(resultCollectionInstance);
                                                    }
                                                });
                                            }
                                        }
                                    }
                                    else {
                                        console.log(err);
                                        next(new Error(g.f('Cannot update collection. Error: ' + err)));
                                    }
                                });

                                // Copy calendars from old collection to new collection
                                collectionInstance.__get__calendars(function (err, oldCalendarInstances) {
                                    if (!err && oldCalendarInstances !== null) {
                                        let hasOneCalendarCopied = false;
                                        oldCalendarInstances.forEach(function (oldCalendarInstance) {
                                            let hasParticipant = participantInstances.some(function (participantInstance) {
                                                return participantInstance.calendarId === oldCalendarInstance.id;
                                            });
                                            // If this calendar has no participant signed up
                                            if (!hasParticipant) {
                                                hasOneCalendarCopied = true;
                                                newCollectionInstance.__link__calendars(oldCalendarInstance.id, function (err, copiedCalendarInstance) {
                                                    // Do nothing here.
                                                    console.log('Linked calendar to new collection');
                                                });
                                                collectionInstance.__unlink__calendars(oldCalendarInstance.id, function (err, deletedCalendarInstance) {
                                                    console.log('Unlinked calendar from old collection');
                                                });
                                            }
                                            else {
                                                console.log('Skipped cloning calendar with participants');
                                            }
                                        });
                                        if (!hasOneCalendarCopied) {
                                            // If no calendar was copied to new instance, we need to link one of the existing calendars to this instance
                                            newCollectionInstance.__link__calendars(oldCalendarInstances[oldCalendarInstances.length - 1].id, function (err, copiedCalendarInstance) {
                                                // Do nothing here.
                                                console.log('Linked calendar to new collection');
                                            });
                                        }
                                    }
                                });

                                // Copy topics from old collection to new collection
                                collectionInstance.__get__topics(function (err, oldTopicInstances) {
                                    if (!err && oldTopicInstances !== null) {
                                        oldTopicInstances.forEach(function (oldTopicInstance) {
                                            newCollectionInstance.__link__topics(oldTopicInstance.id, function (err, copiedTopicInstance) {
                                                // Do nothing here.
                                                console.log('Copied topic for new collection');
                                            });

                                        });
                                    }
                                });

                                // Copy payoutrules from old collection to new collection
                                collectionInstance.__get__payoutrules(function (err, oldPayoutInstances) {
                                    if (!err && oldPayoutInstances !== null) {
                                        oldPayoutInstances.forEach(function (oldPayoutInstance) {
                                            newCollectionInstance.__link__payoutrules(oldPayoutInstance.id, function (err, copiedPayoutInstance) {
                                                // Do nothing here.
                                                console.log('Copied payoutrules for new collection');
                                            });

                                        });
                                    }
                                });
                            }
                        });
                    }
                    else {
                        // This collection has no participants on it. We can delete its content but change status to draft
                        let newCollectionData = collectionInstance.toJSON();
                        newCollectionData.isNewInstance = true;
                        // Copy all contents from oldInstance to new instance
                        collectionInstance.__get__contents({ "include": ["schedules", "locations"] }, function (err, oldContentInstances) {
                            if (!err && oldContentInstances !== null) {
                                let resultCollectionInstance = newCollectionData;
                                resultCollectionInstance['contents'] = oldContentInstances.toJSON();
                                ctx.res.json(resultCollectionInstance);
                            }
                            else {
                                console.log(err);
                                next(new Error(g.f('Cannot update collection. Error: ' + err)));
                            }
                        });
                    }
                });
            }
            else {
                // Collection status is neither draft or active.
                next(new Error(g.f('Cannot delete content in state: ' + collectionInstance.status)));
            }
        }
    });


    Collection.remoteMethod(
        'submitForReview',
        {
            accepts: [
                { arg: 'id', type: 'string', required: true },
                { arg: 'req', type: 'object', http: { source: 'req' } }
            ],
            returns: { arg: 'result', type: 'string' },
            http: { path: '/:id/submitForReview', verb: 'post' }
        }
    );

    Collection.remoteMethod(
        'approve',
        {
            accepts: [
                { arg: 'id', type: 'string', required: true },
                { arg: 'req', type: 'object', http: { source: 'req' } }
            ],
            returns: { arg: 'result', type: 'object', root: true },
            http: { path: '/:id/approve', verb: 'post' }
        }
    );

    Collection.remoteMethod(
        'reject',
        {
            accepts: [
                { arg: 'id', type: 'string', required: true },
                { arg: 'req', type: 'object', http: { source: 'req' } }
            ],
            returns: { arg: 'result', type: 'object', root: true },
            http: { path: '/:id/reject', verb: 'post' }
        }
    );

};
