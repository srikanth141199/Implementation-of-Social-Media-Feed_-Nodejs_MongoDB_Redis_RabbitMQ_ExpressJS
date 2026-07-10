const mongoose=require('mongoose');
module.exports=mongoose.model('Post',new mongoose.Schema({
author:{type:mongoose.Schema.Types.ObjectId,ref:'User'},
content:String,
likes:{type:Number,default:0}
},{timestamps:true}));
