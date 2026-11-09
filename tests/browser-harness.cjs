
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'../site')+'/';
class E{
 constructor(tag,attrs={}){this.tag=tag;this.attrs=attrs;this.dataset={};this.children=[];this.listeners={};this.textContent='';this.inert=false;
 for(const [k,v]of Object.entries(attrs))if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;
 const cls=new Set((attrs.class||'').split(' '));this.classList={add:c=>cls.add(c),remove:c=>cls.delete(c),contains:c=>cls.has(c)};
 this.style={setProperty:(k,v)=>this.style[k]=v}}
 setAttribute(k,v){this.attrs[k]=v}getAttribute(k){return this.attrs[k]??null}addEventListener(e,f){(this.listeners[e]??=[]).push(f)}
 append(...c){this.children.push(...c)}replaceChildren(...c){this.children=c}showModal(){this.open=true}close(){this.open=false}
 querySelector(){return this.frame} getBoundingClientRect(){return {left:0,right:10,top:0,bottom:10}}}
function setup(page,{languages=['ru-RU'],saved=null,query='',blocked=false,seen=false,protocol='file:',respond=null,sessionEntries=[]}={}){
 const html=fs.readFileSync(root+page,'utf8');const nodes=[];
 for(const m of html.matchAll(/<([a-z][\w-]*)\b([^>]*?)>/g)){
 const attrs={};for(const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g))attrs[a[1]]=a[2];nodes.push(new E(m[1],attrs))}
 for(let i=0;i<nodes.length;i++)if((nodes[i].attrs.class||'').includes('website-preview')){nodes[i].clientWidth=400;nodes[i].frame=nodes.slice(i+1).find(n=>n.tag==='iframe')}
 function matches(n,s){if(s[0]==='#')return n.attrs.id===s.slice(1);if(s[0]==='.')return(n.attrs.class||'').split(' ').includes(s.slice(1));const m=s.match(/^(\w+)?\[([\w-]+)(?:="([^"]*)")?\]$/);if(m){const key=m[2].startsWith('data-')?m[2].slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()):null;const value=key?n.dataset[key]:n.attrs[m[2]];return(!m[1]||n.tag===m[1])&&value!==undefined&&(m[3]===undefined||value===m[3]);}return n.tag===s}
 const events={},timers=new Map();let serial=0;const local=new Map(saved?[['slipcast-language',saved]]:[]),session=new Map([...(seen?[['slipcast-navigation-seen','1']]:[]),...sessionEntries]);
 const store=map=>({getItem(k){if(blocked)throw Error('blocked');return map.get(k)},setItem(k,v){if(blocked)throw Error('blocked');map.set(k,v)}});
 const document={hidden:false,documentElement:nodes.find(n=>n.tag==='html'),body:nodes.find(n=>n.tag==='body'),
 querySelector:s=>nodes.find(n=>matches(n,s)),querySelectorAll:s=>nodes.filter(n=>matches(n,s)),createElement:tag=>{const n=new E(tag);nodes.push(n);return n},
 addEventListener(e,f){(events[e]??=[]).push(f)},dispatchEvent(e){for(const f of events[e.type]||[])f()}};
 const preference={matches:false,addEventListener(){}};
 const calls=[];
 const fetch=async (url,options)=>{calls.push({url,options});if(respond)return respond(url,options);throw new TypeError('offline')};
 const context=vm.createContext({document,window:{},navigator:{languages,language:languages[0]},localStorage:store(local),sessionStorage:store(session),location:{protocol,href:(protocol==='file:'?'file:///site/':'https://slipcast-dev.github.io/')+page+query},history:{replaceState(){}},URL,Event,AbortSignal,AbortController,TypeError,Error,fetch,
 setTimeout(f){timers.set(++serial,f);return serial},clearTimeout(id){timers.delete(id)},setInterval(){},console});
 Object.assign(context.window,{addEventListener(){},matchMedia:()=>preference,setTimeout:context.setTimeout,clearTimeout:context.clearTimeout});
 for(const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){const src=m[1].match(/src="([^"]+)"/);vm.runInContext(src?fs.readFileSync(root+src[1],'utf8'):m[2],context)}
 document.dispatchEvent(new Event('DOMContentLoaded'));
 return{document,nodes,local,session,context,timers,calls,click(lang){document.querySelectorAll('[data-language]').find(n=>n.dataset.language===lang).listeners.click.forEach(f=>f())},
 step(){const pair=timers.entries().next().value;assert.ok(pair);timers.delete(pair[0]);pair[1]()}}
}

module.exports={setup,root};
