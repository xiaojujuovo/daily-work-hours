// User-selected files stay in the browser; no upload or fetch is involved.
export async function exportFile(name:string,text:string,mime:string) {
 const url=URL.createObjectURL(new Blob([text],{type:mime}));
 const link=document.createElement('a');
 link.href=url;link.download=name;
 document.body.appendChild(link);
 try{link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
export async function importFile():Promise<string|null> {
 return new Promise((resolve,reject)=>{
  const input=document.createElement('input');
  input.type='file';input.accept='.json,application/json,text/plain';input.hidden=true;
  const cleanup=()=>input.remove();
  input.addEventListener('cancel',()=>{cleanup();resolve(null);},{once:true});
  input.addEventListener('change',async()=>{
   const file=input.files?.[0];
   cleanup();
   if(!file){resolve(null);return;}
   if(file.size>10*1024*1024){reject(new Error('备份文件不能超过10MB'));return;}
   try{resolve(await file.text());}catch{reject(new Error('无法读取备份文件，请重新选择'));}
  },{once:true});
  document.body.appendChild(input);input.click();
 });
}
