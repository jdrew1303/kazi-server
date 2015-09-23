
// BASE SETUP
// =============================================================================

// call the packages we need
var express    = require('express');
var bodyParser = require('body-parser');
var app        = express();
var morgan     = require('morgan');
var path  	   = require('path');
var _    	   = require('lodash');

var ip = require('ip');
var cors = require('cors');


// configure app
// app.use(morgan('dev')); // log requests to the console

// configure body parser
app.use( bodyParser.json({limit: '10mb',parameterLimit: 50000}) );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded(
{     
  extended: true,// to support URL-encoded bodies
  limit: '10mb',
  parameterLimit: 50000
})); 

//cors
app.use(cors());


//Login middleware
// app.use(auth)

// test route to make sure everything is working (accessed at GET http://localhost:8080/api)
app.get('/', function(req, res) {
    res.json({ message: 'hooray! welcome to our api! sgfdxs' });   
});

app.use('/firebase',express.static(path.join(__dirname, '..', 'www','firebase'),{}));

var KAZI={}

var server={

	start: function(kazi){
		//extend server
		KAZI=kazi;
		KAZI.options.port = KAZI.options.port || 2016; // set our port

		app.use(auth);

		// REGISTER OUR ROUTES -------------------------------		
		app.use('/jobs', require('./routes/jobs.js')(KAZI));
		

		// START THE SERVER
		// =============================================================================
		app.listen(KAZI.options.port);
		console.log('KAZI server running on port ' + KAZI.options.port);

	}

}





function auth(req, res, next) {

	//every client request must have a cients name
	if(!_.has(req.body,'client') || !_.has(req.body.client,'name') || req.body.client.name.trim().length===0){
		res.statusCode = 401;
        // MyRealmName can be changed to anything, will be prompted to the user
        res.setHeader('WWW-Authenticate', 'Basic realm="MyRealmName"');
        // this will displayed in the browser when authorization is cancelled
        return res.end('Unauthorized');
	}

	//check that header object matches auth object
	//because this is a recursive check, we can pass as many headers as we wish for extra security
	for(var header in KAZI.auth){

		// 
		if(!_.has(req.headers,header) || KAZI.auth[header]!==req.headers[header] ){

			res.statusCode = 401;
	        // MyRealmName can be changed to anything, will be prompted to the user
	        res.setHeader('WWW-Authenticate', 'Basic realm="MyRealmName"');
	        // this will displayed in the browser when authorization is cancelled
	        return res.end('Unauthorized');

		}

	};

	//add more client deets
	if(_.has(req.body,'client')){
		req.body.client.ip=ip.address();
	}

	// console.log(req.body.client)


   
    next();
}

module.exports=server;