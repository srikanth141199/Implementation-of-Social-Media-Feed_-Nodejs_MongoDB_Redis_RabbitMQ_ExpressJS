const mongoose=require('mongoose');
module.exports=mongoose.model('User',new mongoose.Schema({
name:String,
email:String,
password:String,
followers:{type:Number,default:0},
following:[{type:mongoose.Schema.Types.ObjectId,ref:'User'}]
},{timestamps:true}));
