var path  = require('path');
var _ = require('lodash');
var async = require('async');
var moment = require('moment');
var util = require('util');
var squel = require("squel");
var JSONParse = require('json-parse-safe');
var mkdirp = require('mkdirp');
var Chance = require('chance'),
    chance = new Chance(); 

var chalk= require('chalk');

var logger=require('./log.js');
var log={};

var DB=require('./db.js');
var config=require(path.join(__dirname,'..','bin','config.json'));
// console.log(config)

var db,KAZI;
var jobsToKill=[];

function kazi(options,callback){
	callback=callback || function(){};

	KAZI=this;

	KAZI.options=_.extend(
		{	
			"dbPath":path.join(__dirname,'..','db'),
			"db":'kazi.sqlite',
			"logsPath": path.join(__dirname,'..','logs'),
			"reschedule_after":(10*1000*60), //10 mins
			"priority":{
				'low':60,
				'normal':30,
				'high':0
			}
		},
		options,
		config.options
	);

	KAZI.auth=_.extend(
		{
			"kazi-token":"fapi763500("
		},
		config.auth
	)


	//make relevant paths
	//1st DB Path
	mkdirp.sync(KAZI.options.dbPath);
	//2nd logs path
	mkdirp.sync(KAZI.options.logsPath);

	//init log
	log= new logger({ logsPath:KAZI.options.logsPath });

	KAZI.server={
		"started": moment().format('YYYY-MM-DD HH:mm:ss') ,
		"name": chance.name().toUpperCase(),
		"uptime":0
	}

	// INIT
	KAZI.init(function(){
		var SERVER= require('./server.js');
		// now that we have initialized db, lets start server whilst passing KAZI 
		SERVER.start(KAZI);	

		//start ticker
		KAZI.tick();
		setInterval(KAZI.tick,5000);

		//initial messuptime
		log.firebase( util.format("KAZI Server [%s] started on: %s " , KAZI.server.name, KAZI.server.started) ,'msg');
	});
	
}


kazi.prototype={

	init: function(callback){
		callback = callback || function(){}

		db=new DB(KAZI.options,function(DB){
			callback();

			/*ENSURE TABLE EXISTS OR RUN INIT AGAIN*/
			setInterval(function(){

				//run this check every 60 seconds
				var query='SELECT name FROM sqlite_master WHERE type = "table"';
				db.select(query,function(rows){
					var tables=_.map(rows,'name');
					if(_.indexOf(tables,'jobs')==-1){
						KAZI.init();
					}
				});	

			},60000);	


		});	

	},

	tick: function(){

		/*LOG IMPORTANT VALUES*/
		//recalculate uptime
		KAZI.server.uptime=moment.utc(moment().diff(moment(KAZI.server.started))).format("HH:mm:ss")+' seconds';
		log.firebase(KAZI.server,'server');

		/*SOME IMPORTANT TICKER FUNCTIONS*/
		KAZI.force_reschedule_stuck_jobs();

		//Kill kobs
		KAZI.checkJobsToKill();

	},

	checkJobsToKill: function(){
			var query=squel.select()
					   .from('jobs')
					   .field('id')
					   .where('status < 3')
					   .where('kill_at BETWEEN "'+ moment().subtract(10,'years').format('YYYY-MM-DD HH:mm:ss')  + '" AND "'+moment().format('YYYY-MM-DD HH:mm:ss') +'"')
					   .toString();

		db.select(query,function(rows){

			//add ids to jobsToKill
			_.each(rows,function(job){

				//update table to remove kill at...
				query=squel.update()
						   .table('jobs')
						   .set('kill_at = NULL')
						   .where("id='"+job.id+"'")
						   .toString();

				db.run(query,function(){

					log.info(chalk.magenta.bold("Job: "+ chalk.red(job.id) + " earmarked for immediate death!" ) , util.format('{SELF:%s}', KAZI.server.name));

					jobsToKill=_.union(jobsToKill,[job.id]);

				});
				
			});		

		});
	},

	force_reschedule_stuck_jobs: function(){

		//check all busy jobs (status = 1) whose reschedule_at is passed
		var query=squel.select()
					   .from('jobs')
					   // .field('id')
					   .where('status = 1')
					   .where('reschedule_at BETWEEN "'+ moment().subtract(10,'years').format('YYYY-MM-DD HH:mm:ss')  + '" AND "'+moment().format('YYYY-MM-DD HH:mm:ss') +'"')
					   .toString();

		// console.log(query)

		db.select(query,function(rows){

			if(rows.length>0){

				//reschedule jobs
				var body={
					jobs:rows,
					client:{
						name: util.format('{SELF:%s}', KAZI.server.name) //set client name as self server name
					}
				};

				log.info(chalk.magenta.bold("Stuck Jobs: ("+ chalk.red(_.map(rows,'id').join(', ')) +") to be rescheduled!" ) , body.client.name)

				//
				KAZI.rescheduleJobs(body,function(response){
					// console.log(response);
				});			

			}

		});		

	},

	killJobs :  function(body,callback){

		KAZI.client=body.client;

		if(_.has(body,'jobs') && _.isArray(body.jobs)){

			//merge killjobs
			jobsToKill=_.union(jobsToKill,body.jobs);
			// console.log(jobsToKill)

			callback({
				msg:'asfds',
				jobsToKill:jobsToKill
			});
		}
	},

	resetJobs :  function(body,callback){

		KAZI.client=body.client;

		if(_.has(body,'jobs') && _.isArray(body.jobs)){
			//reset this jobs by resetting status to zero
			var query=squel.update()
						   .table('jobs')
						   .set('status=0')
						   .where('id IN ('+ util.inspect(body.jobs).replace(/[\[\]]/g,'') +')')
						   .where('status>1') //status cannot be 0 or 1
						   .toString();

			// console.log(query);
			//run
			db.run(query,function(){

				log.info("Jobs: (" + chalk.yellow.bold(body.jobs.join(', ')) + ") have been successfully reset." )

				callback({
					msg:'success'
				});

			});
			
		}
		else{
			callback({
				msg:'fail'
			});
		}
	},

	finishJobs : function(body,callback){

		KAZI.client=body.client;
		
		//set job status as 2
		//it is important to call Finish Jobs whenever a job has been closed/totally ended

		if(_.has(body,'jobs')){
			var jobs=body.jobs;
			//if not array
			if(!_.isArray(jobs)){ jobs=[jobs]; }
			//pick ids			
			var ids=_.map(jobs,'id');
			//construct IN() where clause
			var where_array=[];

			//finish each job in turn
			async.eachLimit(jobs,1,function(job,next){

				//if id is among jobs to kill, status will be 3
				var status=2;
				if(_.indexOf(jobsToKill,job.id)>-1){
					status=3;
					log.info(chalk.magenta.bold("Killing Job: "+ chalk.red(job.id)+"..." ), KAZI.client.name);
					//remove id from jobsToKill
					jobsToKill=_.remove(jobsToKill,job.id);
				}

				//construct update query
				var query=squel.update()
			 			.table('jobs')
			 			.set('status='+status) //set status to 2
				        .where( util.format("id='%s'",job.id))
				        .toString();

				//run query now!
				db.run(query,function(rows){	

					log.info('Has successfully finished Job: ' + chalk.red.bold(job.id) , KAZI.client.name);

					//next job				
					next();
				});


			},function(){
				
				callback({
					msg:'success'
				});

			})
			

		}
		else{
			callback({
				msg:'fail'
			});
		}
	},

	rescheduleJobs : function(body,callback){

		KAZI.client=body.client;

		//if there are jobs
		if(_.has(body,'jobs')){

			log.info("Rescheduling Jobs..." , KAZI.client.name);

			KAZI.queueJobs(body,function(){
				callback({
					msg:'success'
				});
			});


		}
		else{
			callback({
				msg:'fail'
			});
		}
	},

	requestJob: function(body,callback){

		KAZI.client=body.client;
		// console.log(body)
		
		if(_.has(body,'name_patterns')){ 

			log.info('Requesting new job.' , KAZI.client.name);

		 	var where_array=[];
		 	
		 	_.each( body.name_patterns, function(pat){
		 		where_array.push(
		 			util.format('name LIKE "%s"',pat)
		 		)
		 	});

		 	var query=squel.select()
		 			.from('jobs')
			        .where(where_array.join(' OR ')) //where ids match pattern
			        .where('status=0') //and is idle
			        .where('next_run BETWEEN "'+ moment().subtract(10,'years').format('YYYY-MM-DD HH:mm:ss')  + '" AND "'+moment().format('YYYY-MM-DD HH:mm:ss') +'"') // run time has arrived
			        .limit(1)
			        .toString();

		}
		else{
			
			//select without name patterns
			var query=squel.select()
		 			.from('jobs')
			        .where('status=0') //and is idle
			        .where('next_run BETWEEN "'+ moment().subtract(10,'years').format('YYYY-MM-DD HH:mm:ss')  + '" AND "'+moment().format('YYYY-MM-DD HH:mm:ss') +'"') // run time has arrived
			        .limit(1)
			        .toString();
		}


		// Log job to firebase
		log.firebase({ client:KAZI.client });

		//run query
		db.select(query,function(rows){

			// console.log(rows)
			var job={};
			if(rows.length>0){

				job={
					id:rows[0].id,
					name:rows[0].name,
					data:JSONParse(rows[0].data).value || '',
					meta:_.omit(rows[0],'id','name','data')
				}

				//calculate rescheduled at...
				job.meta.reschedule_at = moment().add(_.parseInt(job.meta.reschedule_after),'seconds').format('YYYY-MM-DD HH:mm:ss') ;

				//set status as 1 to show job is active
				job.meta.status=1; 

				//if job has a ttl, then invoke iyt now..
				if(job.meta.ttl){
					// console.log(job)
					log.info(chalk.magenta.bold("Job: "+ chalk.red(job.id) + " will die in approximately " + (job.meta.ttl/1000) + " seconds" ) , body.client.name);
					
					//set kill at
					job.meta.kill_at=moment().add( (job.meta.ttl/1000), 'seconds').format('YYYY-MM-DD HH:mm:ss');

					//unset ttl
					job.meta.ttl=null;

				}
				

				//add served at time
			    job.meta.served_at=moment().format('YYYY-MM-DD HH:mm:ss');


				//update job status & reschedule_at
				query=squel.update()
			        .table("jobs")
			        .setFields(_.pick(job.meta,'status','reschedule_at','ttl','kill_at'))
			        .where(util.format("id='%s'",job.id))
			        .toString();

			    // console.log(query);
			    //run query
			    db.run(query,function(){
			    	log.info("Job: "+ chalk.red.bold(job.id) +" served!" , KAZI.client.name);

			    	// Log job to firebase
			    	log.firebase({ job:job , client:KAZI.client });

			    	callback(job);
			    });

			}
			else{
				log.info(chalk.gray("No job to serve!") , KAZI.client.name)
				callback(job);
			}
		});
	},

	//add Jobs
	queueJobs: function(body,callback){

		KAZI.client=body.client;
		
		if(!_.has(body,'jobs')){
			return callback({
				"msg":"Fail"
			})
		}

		var jobs=body.jobs;
		var scheduled=[];

		//from object to array
		if(_.isObject(jobs) && _.has(jobs,'0')){ jobs=_.values(jobs); }

		//ensure is array...
		if(!_.isArray(jobs)){ jobs=[jobs]; }

		var query='';

		//async queue all jobs
		async.eachLimit(jobs,1,function(job,next){

			//format job values to job id,name,data & meta
			if((job=KAZI.formatJob(job))){

				scheduled.push(job);

				//job insert
				KAZI.jobSQL(job,function(query){
					// console.log(query);
					//now run query
					db.run(query,function(response){

						//IF KILLED
						if(job.meta.status==3){
							// console.log('HGfshs')
							log.info(chalk.magenta.bold("Job: "+ chalk.red.bold(job.id) +" successfully killed!") , KAZI.client.name);
						}
						else{
							// console.log('HGfshs')
							log.info("Job: "+ chalk.red.bold(job.id) +" successfully scheduled ("+job.meta.delay+" seconds delay applied)" , KAZI.client.name);	
						}
						

						//next job...
						next();
					});	

				});	

			}
			else{
				next();
			}
			

		},function(){

			// Scheduling finished!!!
			callback({
				jobs:scheduled,
				msg:'success'
			})
			// callback();
		});
	},

	jobSQL: function(job,callback){

		// console.log(job)

		// fields = job.id, job.name, job.data & meta fields
		var fields=_.merge(
						{   "id":job.id,
							"name":job.name,
							"data":job.data
						},
						job.meta
					)

		//pick fields
		fields= _.pick(fields, ['id','name','data','created','updated','next_run','delay','version','reschedule_after','reschedule_at','priority','status','ttl'] );

		//format fields
		_.each(fields,function(val,i){ 
			//no undefined values
			if(val==undefined){ fields[i]=null; }
			//no objects
			if(_.isObject(val)){
				fields[i]=JSON.stringify(val);
			} 
		});

		// console.log(fields)

		//does job exist? Should we do an update or insert

		var q=squel.select()
		        .from("jobs")
		        .field('id')
		        .where(util.format("id='%s'",fields.id))
		        .toString();

		db.select(q,function(rows){

			//set job version
			if(rows.length){

				q=squel.update()
				        .table("jobs")
				        .setFields(_.omit(fields,'id','name'))
				        .set("version = version + 1") //increment version
				        .where(util.format("id='%s'",fields.id))
				        .toString()
			}
			else{

				//make job SQL
				q=squel.insert()
				        .into("jobs")
				        .setFields(fields)
				        // .set("version = 1") //version ==1
				        .toString()
				        //add OR IGNORE to escape errors on repeated jobs
				        .replace(/INSERT\s+INTO/i,'INSERT OR IGNORE INTO');

			}

			callback(q);

		});
	},

	formatJob: function(job,callback){

		//job must have id and name, at the least
		if(!_.has(job,'id') || !_.has(job,'name')){
			return null;
		}

		//set some defaults
		var now=moment().format('YYYY-MM-DD HH:mm:ss') ;

		/*MERGE IN META FOR UNIFORM FORMATING OF JOB.VALUES & JOB.META.VALUES*/
		if(_.has(job,'meta')){
			job=_.merge(job.meta,job)
		}


		//convert numeric values to numerics
		_.each(job,function(val,key){
			if(_.isString(val) && /^[0-9]+$/.test(val)){
				job[key]=parseFloat(val);
			}
		});
		

		var meta= {};

		/*CREATED TIME*/
		meta.created=now;
		/*UPDATED TIME*/
		meta.updated=now;

		/*INITIAL JOB STATUS IS ALWAYS 0 or 3 for jobs that are to be killed*/
		meta.status=0;
		
		if(_.indexOf(jobsToKill,job.id)>-1){
			meta.status=3;
			//remove id from jobsToKill
			jobsToKill=_.remove(jobsToKill,job.id);
			
			log.info(chalk.magenta.bold("Killing Job: "+ chalk.red(job.id)+" ..." ), KAZI.client.name);

		}

		/*TERMINATE JOB AFTER*/
		// console.log(job);
		meta.reschedule_after=_.parseInt(job.reschedule_after) || KAZI.options.reschedule_after


		/*DELAY, HAVE DEFAULT RANDOM*/
		var delay=Math.floor(Math.random()*60);

		//next run is based on priority 
		if(job.priority && _.has(KAZI.options.priority,job.priority)){
			delay=KAZI.options.priority[job.priority]
			meta.priority=job.priority;
		}

		//an explicit delay value ovewrites whatever may have been set via priority
		if(_.has(job,'delay')){ delay=_.parseInt(job.delay); }
		
		meta.delay=delay;

		/*NEXT RUN TIME*/
		meta.next_run=moment().add(delay,'seconds').format('YYYY-MM-DD HH:mm:ss') ;
		
		meta.ttl=_.parseInt(job.ttl) || null;

		/*REMOVE DEFAULT VALUES FROM JOBS INTO META*/
		job=_.pick(job,['id','name','data']);

		job.meta=meta;

		// console.log(job)	

		return job;
	}

}


module.exports=kazi;

