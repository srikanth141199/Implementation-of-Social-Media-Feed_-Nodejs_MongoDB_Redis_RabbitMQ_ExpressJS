const Post=require('../models/Post');
const User=require('../models/User');

exports.getFeed=async(userId)=>{
 const user=await User.findById(userId).select('following');
 const posts=await Post.find({author:{$in:user.following}})
 .sort({createdAt:-1})
 .populate('author','name')
 .lean();
 return posts;
};
