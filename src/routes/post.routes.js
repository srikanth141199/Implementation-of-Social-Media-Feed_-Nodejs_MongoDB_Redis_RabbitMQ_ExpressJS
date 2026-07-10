const r=require('express').Router();
const c=require('../controllers/post.controller');
r.post('/post',c.create);
module.exports=r;
