
var express    = require('express');
var _ = require('lodash')
var JSONParse = require('json-parse-safe');

var KAZI={};

// ROUTES FOR OUR API
// =============================================================================

// create our router
var router = express.Router();

// test route to make sure everything is working (accessed at GET http://localhost:8080/api)
router.get('/', function(req, res) {
    res.json({ message: 'hooray! welcome to our api!' });   
});

// on routes that end in JOBS
// ----------------------------------------------------
router.route('/queueJobs')
    .post(function(req, res) {

        //queueJobs
        KAZI.queueJobs(req.body,function(response){
            //send back respond to user
            res.json(response);
        });        

    });

router.route('/requestJob')
    //use middleware to block concurrent calls to give time for db upfdate
    .post(blocked, function(req, res) {
        
        //indicate that we are very busy
        process.isBusy = true;
        //queueJobs
        KAZI.requestJob(req.body,function(response){
            //okay, not too busy now
            process.isBusy = false;
            
            //send back respond to user
            res.json(response);
        });        

    });

router.route('/finishJobs')
    .post(function(req, res) {        

        //queueJobs
        KAZI.finishJobs(req.body,function(response){
            //send back respond to user
            res.json(response);
        });        

    });

router.route('/rescheduleJobs')
    .post(function(req, res) {        
        
        //queueJobs
        KAZI.rescheduleJobs(req.body,function(response){
            //send back respond to user
            res.json(response);
        });        

    });

router.route('/killJobs')
    .post(function(req, res) {        

        //queueJobs
        KAZI.killJobs(req.body,function(response){
            //send back respond to user
            res.json(response);
        });        

    });
    
router.route('/resetJobs')
    .post(function(req, res) {        

        //queueJobs
        KAZI.resetJobs(req.body,function(response){
            //send back respond to user
            res.json(response);
        });        

    });
    
module.exports=function(kazi){
    KAZI=kazi;   
    return router 
}

var async = require('async');

function blocked(req, res, next) {
    process.isBusy = process.isBusy  || false;

    async.whilst(
        function(){return process.isBusy },
        function(callback){
            // console.log(process.isBusy )
            setTimeout(callback,1);
        },
        next
    )
}
