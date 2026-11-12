import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8'};
createServer(async(req,res)=>{const name=new URL(req.url,'http://localhost').pathname;const file=name==='/'?'index.html':name.slice(1);if(!['index.html','app.js','style.css','config.js'].includes(file)){res.writeHead(404).end();return;}try{res.writeHead(200,{'Content-Type':types[file.split('.').pop()]});res.end(await readFile(new URL(`./dist/${file}`,import.meta.url)));}catch{res.writeHead(500).end();}}).listen(4173,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4173'));
