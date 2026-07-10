const ranking=require('../services/ranking.service');

exports.rank=(req,res)=>{
 const posts=req.body.posts||[];
 const ranked=ranking.rankPosts(posts);
 res.json({
   weights:{
    recency:0.8,
    likes:0.2
   },
   total:ranked.length,
   feed:ranked
 });
};
