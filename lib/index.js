
var express    = require('express');
var aggs=require('./lib/aggregations.js');
var _ = require('lodash')



// ROUTES FOR OUR API
// =============================================================================

// create our router
var router = express.Router();

// middleware to use for all requests
router.use(function(req, res, next) {
    // do logging
    console.log('Something is happening.');
    next();
});

// test route to make sure everything is working (accessed at GET http://localhost:8080/api)
router.get('/', function(req, res) {
    res.json({ message: 'hooray! welcome to our api!' });   
});

// on routes that end in /aggs
// ----------------------------------------------------
router.route('/aggs')

    // create a bear (accessed at POST http://localhost:8080/bears)
    // .post(function(req, res) {
        
    //     var bear = new Bear();      // create a new instance of the Bear model
    //     bear.name = req.body.name;  // set the bears name (comes from the request)

    // })

    // get all the bears (accessed at GET http://localhost:8080/api/bears)
    .get(function(req, res) {
        
        aggs(req.query,function(data){

            if(req.query.export){
                // 
                forceDownload('aggregations.zip',res);

                res.send(data);
            }
            else{
                res.json(data);
            }

            

        },true);
       

    });



function forceDownload(filename, res) {
  var escapedName = filename.replace(/"/g, '\"');
  var asciiName = escapedName.replace(/[^\x20-\x7E]/g, "?");
  var encodedName = encodeURIComponent(escapedName);

  res.setHeader('Content-Type', 'application/force-download');
  res.setHeader('Content-Disposition', "attachment; filename=\""
    + asciiName + "\"; filename*=UTF-8''" + encodedName);
}

module.exports=router;