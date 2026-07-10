const r=require('express').Router();
const c=require('../controllers/hybrid.controller');
r.get('/feed/hybrid',c.feed);
module.exports=r;
