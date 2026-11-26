import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve(process.env.DDA_ROOT||'dist');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const server=createServer(async(req,res)=>{
  try {
    const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    const file=path===root?resolve(root,'index.html'):path;
    if(!file.startsWith(root+sep)||!types[extname(file)]){res.writeHead(404).end();return;}
    const content=await readFile(file);
    res.writeHead(200,{'Content-Type':types[extname(file)],'Cache-Control':'no-store'}).end(content);
  }catch{res.writeHead(404).end('Not found');}
});
server.listen(Number(process.env.PORT||4188),'127.0.0.1',()=>console.log('Daily Department Activity: http://127.0.0.1:'+server.address().port+'/'));
