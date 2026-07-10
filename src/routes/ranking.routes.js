const r=require('express').Router();
const c=require('../controllers/ranking.controller');
r.post('/feed/rank',c.rank);
module.exports=r;
