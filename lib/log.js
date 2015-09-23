var path = require('path');
var util = require('util');
var log4js = require('log4js');
var config= require(path.join(__dirname,'..','bin','config.json'));
var _ = require('lodash');
var Firebase = require('firebase');   
var firebase ={};
var moment = require('moment');
var chalk = require('chalk')


function log(options){

    this.options=_.extend(
        {logsPath : path.join(__dirname,'..','logs') },
        options
    );

    log4js.configure({

      appenders: [

        {   
            "type": 'console' , 
            "category": 'server' 
        },
        {   "type": 'file', 
            "filename": path.join(this.options.logsPath,'server.log')  , 
            "category": 'server-error' ,
            "maxLogSize": 20480,
            "backups": 10
        }
        
      ]

    });

    file_logger = log4js.getLogger('server-error');
    file_logger.setLevel('ERROR');

    console_logger = log4js.getLogger('server');

    //init firebase
    if(config.loggers.firebase.url && config.loggers.firebase.url.length){
        firebase = new Firebase(config.loggers.firebase.url );
    }

}

log.prototype={

    log: function(msg,level,client){


        //format msg to include client name
        if(client && typeof client=='string'){ 
            msg= '['+chalk.blue.bold.underline(_.pad( client,14,' ') )+'] >> '  + msg 
        }

        file_logger[level](msg); 
        console_logger[level](msg);
    },

    firebase: function(obj, key, client){

        if(client && typeof client=='string' &&  typeof obj=='string'){ 
            obj=util.format('[%s] - [%s] - %s',moment().format('YYYY-MM-DD HH:mm:ss:ms'),client, obj)  
        }

        if(key){ var firebase_obj={}; firebase_obj[key]=obj; }
        else{ firebase_obj=obj;  }

        //if not job, delete
        if(key && key !== 'job'){
            // firebase_obj["job"]={}
        }

        firebase.update(firebase_obj);
    }
    
}

var levels=['trace','debug','info','warn','error','fatal'];

levels.forEach(function(level){
    log.prototype[level]=function( msg, client){
        log.prototype.log(msg,level,client);
    }
})


module.exports=log;