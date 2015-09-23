var sqlite3 = require('sqlite3').verbose();
var path  = require('path');
var _ = require('lodash');
var mkdirp = require('mkdirp');
var async = require('async');
var multiline = require('multiline');
var TransactionDatabase = require("sqlite3-transactions").TransactionDatabase;

var DB={}


function db(options,callback){
	DB=this;

	DB.options=_.extend(
		{	
			dbPath:path.join(__dirname,'..','db'),
			db:'kazi.sqlite'
		},
		options
	);

	//Indicate that DB has not been initialized
	DB.db={initialized:false};

	// make directory
	mkdirp.sync(DB.options.dbPath);

	var db_path=path.join(DB.options.dbPath,DB.options.db);
	// var db_path=':memory:'

	//load db
	var db = new TransactionDatabase(
	    new sqlite3.Database(db_path, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
	    function(d){

	    	//set DB as ready
			DB.db=db;

			//initialize
			DB.init(function(){
				//indicate that table is initialized
				// console.log('initialized');
				DB.db.initialized=true;

				// console.log(DB.ready())
				callback(db)
			});
	    })
	);

	

	// var db=new sqlite3.Database( db_path ,function(){
		
	// });
}

//db functions
db.prototype={

	//init method
	init:function(callback){
		var multiquery = multiline(function(){
			/*
				--CREATE TABLES
				CREATE TABLE IF NOT EXISTS "main"."jobs" (
					"id"  TEXT(255) NOT NULL,
					"name"  TEXT(255) NOT NULL,
					"data"  TEXT,
					"priority" TEXT (50),
					"created"  TEXT(30),
					"updated"  TEXT(30),
					"next_run"  TEXT(30),
					"reschedule_at"  TEXT(30),
					"ttl"  REAL  DEFAULT 0.0,
					"kill_at"  TEXT(30),
					"reschedule_after"  INTEGER,
					"delay"  REAL  DEFAULT 0.0,					
					"version"  INTEGER DEFAULT 1,
					-- status (0==idle, 1= busy, 2=finished)
					"status"  INTEGER DEFAULT 0,
					PRIMARY KEY ("id")
				);

				--Create some indexes
				CREATE INDEX "main"."name"
				ON "jobs" ("name" ASC);

				CREATE INDEX "main"."next_run"
				ON "jobs" ("next_run" ASC);

				CREATE INDEX "main"."updated"
				ON "jobs" ("updated" ASC);

				CREATE INDEX "main"."reschedule_at"
				ON "jobs" (reschedule_at);


			*/
		});

		//split queries by ; and run all using async whilst
		var queries=_.compact(multiquery.split(';')),
			query='';

		async.whilst(
		    function () { return queries.length; },
		    function (callback) {
		        query=queries.shift(); 
		        DB.run(query,callback);		        
		    },
		    callback
		);
	},

	//insert record

	//update record


	//select records from db
	select: function(query,callback){

		// console.log(query);
		DB.db.serialize(function() {

			var rows=[];
			//run and callback on completion
			DB.db.each(query,function(err,row){
				rows.push(row);
			},function(){
				callback(rows);
			});	

		});

	},

	//to run db queries
	run:function(query,callback){
		// console.log(query);
		

		DB.db.serialize(function() {

			//Run DB Calls via async waterfall
			async.waterfall(
				
				[ 
					function(callback){ callback() } ,
					// //some pragmas to speed up things
					function(callback){  DB.db.run("PRAGMA synchronous=OFF",callback) },
					function(callback){  DB.db.run("PRAGMA count_changes=OFF",callback) },
					function(callback){  DB.db.run("PRAGMA journal_mode=MEMORY",callback) },
					function(callback){  DB.db.run("PRAGMA temp_store=MEMORY",callback) },
				
					// //lets now begin transaction
					// function(callback){  DB.db.run("BEGIN TRANSACTION",callback) },
					//your query here...
					function(callback){ 
						DB.db.run(query,callback) 
					},
					//
					// function(callback){  
					//   DB.db.run("COMMIT",function(){ 

					//   },function(){
					//     //on commit end...
					//     callback();
					//   });
					// }
				]
			,function (err,res) {
			  callback(null); 
			});

		})


		// //run and callback on completion
		// DB.db.run(query,function(){},function(){
		// 	callback(null);
		// });		

	},

	ready:function(){
		return DB.db.open===true && DB.db.initialized===true;
	}
}

module.exports= db;

