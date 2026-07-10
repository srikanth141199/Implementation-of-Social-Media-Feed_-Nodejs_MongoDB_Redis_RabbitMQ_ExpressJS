const r=require('express').Router();
const c=require('../controllers/feed.controller');
r.get('/feed',c.pullFeed);
module.exports=r;
