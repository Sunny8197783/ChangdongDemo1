const { chromium } = require('playwright'); const http=require('http'),fs=require('fs'),path=require('path');
const ROOT='/home/user/changdongdemo1'; const port=8100+Math.floor(Math.random()*900);
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png'};
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html'; const f=path.join(ROOT,p); if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end();} res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'}); fs.createReadStream(f).pipe(res);}).listen(port);
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:960,height:540}});
await p.goto(`http://localhost:${port}/?test=1&cls=mage`); await p.waitForFunction(()=>window.game&&game.ready,null,{timeout:90000});
const r=await p.evaluate(()=>{const g=game; g.freeze(true); const st=document.createElement('style'); st.textContent='#ui{opacity:0!important}'; document.head.appendChild(st);
 g.player.setLook(0,-0.12); g.step(30,1/60); const pp=g.player.object.position; const T=g.THREE; const out={};
 const R=g.renderer; const rt=new T.WebGLRenderTarget(320,180);
 const count=(m)=>{const sc=new T.Scene(); const par=m.parent; sc.add(m); R.setRenderTarget(rt); R.setClearColor(0,1); R.clear(); R.render(sc,g.camera); const buf=new Uint8Array(320*180*4); R.readRenderTargetPixels(rt,0,0,320,180,buf); R.setRenderTarget(null); par.add(m); let n=0; for(let i=0;i<buf.length;i+=4) if(buf[i]+buf[i+1]+buf[i+2]>10)n++; return n;};
 const shapes=[{shape:'circle',r:3},{shape:'ring',r:3,inner:1.5},{shape:'cone',r:6,angle:60,dir:new T.Vector3(0.3,0,1).normalize()},{shape:'line',len:8,width:1.5,dir:new T.Vector3(1,0,0.2).normalize()},{shape:'line',len:8,width:1.5,dir:new T.Vector3(0,0,-1)}];
 for(const s of shapes){ const q=pp.clone(); q.z-=6; const h=g.vfx.telegraph({...s,pos:q,dur:4,color:'damage'}); g.step(40,1/60); let m=null; g.scene.traverse(o=>{if(o.name==='vfx-telegraph'&&o.visible)m=o;});
   const front=count(m); m.material.side=T.DoubleSide; m.material.needsUpdate=true; const dbl=count(m); m.material.side=T.FrontSide; m.material.needsUpdate=true; h.stop();
   out[s.shape+(s.dir?JSON.stringify(s.dir.toArray().map(x=>+x.toFixed(1))):'')]={front,double:dbl}; }
 return out;});
console.log(JSON.stringify(r)); await b.close(); server.close();})();
