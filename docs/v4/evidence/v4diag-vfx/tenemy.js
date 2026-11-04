const { chromium } = require('playwright'); const http=require('http'),fs=require('fs'),path=require('path');
const ROOT='/home/user/changdongdemo1'; const port=8100+Math.floor(Math.random()*900);
const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png'};
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html'; const f=path.join(ROOT,p); if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end();} res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'}); fs.createReadStream(f).pipe(res);}).listen(port);
(async()=>{const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const p=await b.newPage({viewport:{width:960,height:540}});
await p.goto(`http://localhost:${port}/?test=1&cls=sword&level=20`); await p.waitForFunction(()=>window.game&&game.ready,null,{timeout:90000});
const type=process.argv[2]||'golem';
const r=await p.evaluate(async(type)=>{const g=game; g.freeze(true); const st=document.createElement('style'); st.textContent='#ui{opacity:0!important}'; document.head.appendChild(st);
 g.player.setLook(0,-0.12); g.step(30,1/60); const pp=g.player.object.position; const T=g.THREE;
 const calls=[]; const orig=g.vfx.telegraph; g.vfx.telegraph=(o)=>{calls.push({shape:o.shape,r:o.r,len:o.len,dur:o.dur}); return orig(o);};
 const q=pp.clone(); q.z-=6; q.y=g.world.getHeight(q.x,q.z); const e=g.debug.spawn(type,{pos:q}) || g.enemies.spawn(type,q,{});
 if(e){e.aggro=true; e.debugAggro=true;}
 let found=-1; for(let i=0;i<600;i++){ g.player.hp=g.player.maxHp; if(g.player.entity)g.player.entity.hp=g.player.maxHp; g.step(1,1/60); let any=false; g.scene.traverse(o=>{if(o.name==='vfx-telegraph'&&o.visible)any=true;}); if(any&&found<0){found=i; g.step(12,1/60); break;} }
 return {type, spawned:!!e, calls, found};},type);
console.log(JSON.stringify(r));
if(r.found>=0){
 await p.evaluate(()=>{const c=game.camera; game.renderNow();}); await p.screenshot({path:`/tmp/v4diag-vfx/tele/enemy_${type}_front.png`});
 await p.evaluate(()=>{game.scene.traverse(o=>{if(o.name==='vfx-telegraph'){o.material.side=game.THREE.DoubleSide;o.material.needsUpdate=true;}}); game.renderNow();}); await p.screenshot({path:`/tmp/v4diag-vfx/tele/enemy_${type}_double.png`});
}
await b.close(); server.close();})();
