const Post=require('../models/Post');
const pub=require('../queue/publisher');

exports.create=async(req,res)=>{
 const post=await Post.create({
   author:req.user.id,
   content:req.body.content
 });
 await pub.publishPost({...post.toObject(),followers:req.body.followers||[]});
 res.status(201).json(post);
};
