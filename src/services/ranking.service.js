const cfg=require('../config/ranking.config');

function recencyScore(createdAt){
 const ageMinutes=(Date.now()-new Date(createdAt).getTime())/60000;
 return Math.max(0,100-ageMinutes/10);
}

exports.rankPosts=(posts)=>{
 return posts.map(p=>{
   const score=(cfg.RECENCY_WEIGHT*recencyScore(p.createdAt))
      +(cfg.LIKE_WEIGHT*(p.likes||0));
   return {...p,score};
 }).sort((a,b)=>b.score-a.score)
   .slice(0,cfg.TOP_K);
};
