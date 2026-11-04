export default function install(app) {
 const root=app.getMount('content-assistant'),detail=app.getMount('dependency-explorer');
 const el=(tag,text,styles={})=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;Object.assign(n.style,styles);return n;};
 const wrap={minWidth:'0',maxWidth:'100%',boxSizing:'border-box',overflowWrap:'anywhere',whiteSpace:'normal'};
 Object.assign(root.style,{...wrap,fontFamily:'Aptos, Segoe UI, sans-serif',fontSize:'12px',color:'#172b4d'});
 const intro=el('p','Consulta guiada · datos reales de ArcGIS Online. No utiliza IA generativa.',{color:'#64748b',fontSize:'11px',lineHeight:'1.5',margin:'0 0 9px'});
 const examples=el('div',null,{display:'flex',gap:'5px',flexWrap:'wrap',marginBottom:'9px'});
 const form=el('form'),input=el('textarea',null,{...wrap,width:'100%',resize:'vertical',minHeight:'65px',padding:'9px',border:'1px solid #cbd5e1',borderRadius:'8px',font:'inherit'});input.rows=2;input.maxLength=400;input.placeholder='¿Cuántos mapas web hay?';input.setAttribute('aria-label','Pregunta sobre el contenido de ArcGIS');
 const controls=el('div',null,{display:'flex',gap:'6px',flexWrap:'wrap',marginTop:'7px'});
 const send=el('button','Preguntar',{background:'#1769aa',color:'white',border:'0',borderRadius:'7px',padding:'8px 12px',cursor:'pointer'});send.type='submit';
 const clear=el('button','Limpiar',{background:'white',color:'#1769aa',border:'1px solid #cbd5e1',borderRadius:'7px',padding:'8px 12px',cursor:'pointer'});clear.type='button';controls.append(send,clear);form.append(input,controls);
 const transcript=el('div',null,{...wrap,maxHeight:'380px',overflowY:'auto',marginTop:'10px'});transcript.setAttribute('aria-live','polite');transcript.setAttribute('aria-relevant','additions');
 root.replaceChildren(intro,examples,form,transcript);
 let disposed=false,busy=false,portal=null,revision=0;
 const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 function interpret(text){
  const n=normalize(text);
  if(/(eliminar|borrar|publicar|compartir|editar|modificar|crear|cambiar permisos)/.test(n))return{unsupported:'Este asistente es de solo lectura: no modifica ni comparte contenido.'};
  if(/(depende|dependencias|utiliza|utilizado por|impacto|relaciones|seleccionado)/.test(n))return{detail:true};
  if(!/(busca|buscar|muestra|mostrar|dame|lista|listar|cuant|ultim|recient|mapa|dashboard|cuadro de mando|capa|escena|aplicacion|contenido|elemento)/.test(n))return{unsupported:'Puedo buscar contenido, contar elementos por tipo y listar los más recientes. Prueba «Busca mapas de agua», «¿Cuántos dashboards hay?» o «Últimos elementos».'};
  const types=[[/\b(?:dashboards?|cuadros? de mando)\b/,'Dashboard'],[/\bescenas?\b/,'Web Scene'],[/\bmapas?(?: web)?\b/,'Web Map'],[/\b(?:capas?(?: de entidades)?|feature services?)\b/,'Feature Service'],[/\baplicaciones?(?: web)?\b/,'Web Mapping Application']];
  const match=types.find(([re])=>re.test(n));
  let remainder=n.replace(/[¿?¡!.,;:]/g,' ');
  if(match)remainder=remainder.replace(new RegExp(match[0].source,'g'),' ');
  remainder=remainder.replace(/\b(busca|buscar|buscame|muestra|mostrar|muestrame|dame|lista|listar|cuantos|cuantas|cuanto|cuanta|ultimos|ultimas|recientes|reciente|hay|tenemos|tengo|existen|ver|quiero|por favor|contenido|contenidos|elemento|elementos|todos|todas|los|las|el|la|un|una|de|del|sobre|con|en|mi|mis|organizacion|nuestra|nuestro|portal|web)\b/g,' ').replace(/\s+/g,' ').trim();
  if(/\b(propietario|usuario|dueno|antes|despues|fecha|ayer|hoy|mes|ano|publicos|privados|sin uso)\b/.test(remainder))return{unsupported:'Todavía no interpreto filtros por propietario, fecha, acceso ni contenido sin uso. Puedo filtrar por tipo y palabras clave, y ordenar por modificación reciente.'};
  const terms=remainder.split(' ').filter(Boolean);
  if(terms.some(t=>!/^[-a-z0-9_]+$/.test(t)))return{unsupported:'Utiliza palabras clave sencillas, sin operadores de búsqueda. Por ejemplo: «Busca mapas de agua».'};
  return{type:match?.[1]||null,terms,count:/cuant/.test(n)};
 }
 function addTurn(question){const box=el('div',null,{...wrap,borderTop:'1px solid #e2e8f0',padding:'10px 0'});box.append(el('div',question,{fontWeight:'700',marginBottom:'7px',...wrap}));const answer=el('div','Consultando…',{lineHeight:'1.5',...wrap});box.append(answer);transcript.append(box);while(transcript.children.length>4)transcript.firstElementChild.remove();return answer;}
 async function ask({question}){
  question=String(question||'').trim().slice(0,400);if(!question)return{empty:true};if(busy)return{busy:true};
  const intent=interpret(question),answer=addTurn(question),token=++revision;
  if(intent.unsupported){answer.textContent=intent.unsupported;return{supported:false,answer:answer.textContent};}
  if(intent.detail){const title=detail.querySelector('[data-selected-title]')?.textContent;
   if(!title){answer.textContent='Selecciona primero un elemento en el inventario. Después consulta sus relaciones en «Detalle y relaciones».';return{selected:false};}
   const usedBy=/utilizado por|impacto|quien/.test(normalize(question));
   answer.textContent=`Elemento seleccionado: ${title}. ${usedBy?'La pestaña «UTILIZADO POR» revisa hasta 60 elementos recientes accesibles. Es una muestra parcial: no permite asegurar que un elemento no tenga consumidores.':'La pestaña «UTILIZA» muestra las referencias detectadas en los datos accesibles del elemento. Las configuraciones o recursos protegidos pueden ocultar otras dependencias.'} Este asistente no ejecuta un análisis adicional de relaciones.`;
   return{selected:true,title,answer:answer.textContent};
  }
  busy=true;send.disabled=true;send.textContent='Consultando…';
  try{
   if(!portal){const Portal=await app.import('esri/portal/Portal');const p=new Portal({url:app.portalUrl});await p.load();portal=p;}
   if(disposed||token!==revision)return{cancelled:true};
   const org=portal.user?.orgId||portal.id,user=portal.user?.username;
   if(!org&&!user)throw new Error('No se ha podido identificar la organización ni el usuario; no se realizará una búsqueda global.');
   const parts=[org?`orgid:${org}`:`owner:${user}`];if(intent.type)parts.push(`type:"${intent.type}"`);for(const term of intent.terms)parts.push(`"${term}"`);
   const result=await portal.queryItems({query:parts.join(' AND '),start:1,num:intent.count?1:app.config.resultLimit,sortField:'modified',sortOrder:'desc'});
   if(disposed||token!==revision)return{cancelled:true};
   const total=result.total,rows=result.results||result.items||[];
   answer.replaceChildren();
   answer.append(el('div',`Interpretación: ${intent.count?'contar':'listar'} ${intent.type||'todos los tipos'}${intent.terms.length?` · palabras: ${intent.terms.join(', ')}`:''}.`,{color:'#64748b',fontSize:'11px',...wrap}));
   answer.append(el('div',total>=0?`${total.toLocaleString('es-ES')} ${total===1?'coincidencia':'coincidencias'}.`:'El portal no ha devuelto un total.',{fontWeight:'700',margin:'6px 0'}));
   answer.append(el('div',org?'Ámbito: contenido de la organización accesible con tu sesión.':'Ámbito: contenido propio; no se pudo identificar la organización.',{color:'#64748b',fontSize:'11px',...wrap}));
   if(!intent.count){answer.append(el('div',`Hasta ${app.config.resultLimit} resultados, ordenados por última modificación.`,{color:'#64748b',fontSize:'11px',marginTop:'5px'}));for(const item of rows){const card=el('div',null,{border:'1px solid #dbe3ed',borderRadius:'7px',padding:'8px',marginTop:'7px',...wrap});card.append(el('div',item.title||'(Sin título)',{fontWeight:'700',lineHeight:'1.45',...wrap}),el('div',`${item.type} · ${item.owner}`,{fontSize:'10px',color:'#64748b',margin:'5px 0',...wrap}));const a=el('a','Abrir en ArcGIS ↗',{display:'inline-block',color:'#1769aa',fontSize:'11px',...wrap});a.href=item.itemPageUrl||`${portal.url.replace(/\/$/,'')}/home/item.html?id=${encodeURIComponent(item.id)}`;a.target='_blank';a.rel='noopener noreferrer';card.append(a);answer.append(card);}}
   return{supported:true,total,returned:intent.count?0:rows.length,interpretation:{type:intent.type,terms:intent.terms,count:intent.count},scope:org?'organization-accessible':'own-content'};
  }catch(e){if(!disposed&&token===revision)answer.textContent=`No se pudo consultar el portal: ${e.message||e}`;return{error:String(e.message||e)};}
  finally{busy=false;if(!disposed){send.disabled=false;send.textContent='Preguntar';}}
 }
 const submit=e=>{e.preventDefault();ask({question:input.value});};form.addEventListener('submit',submit);
 const clearFn=()=>{revision++;transcript.replaceChildren();input.value='';};clear.addEventListener('click',clearFn);
 for(const question of ['Busca mapas de agua','¿Cuántos dashboards hay?','Últimos elementos']){const b=el('button',question,{background:'#eaf3fb',color:'#1769aa',border:'0',borderRadius:'6px',padding:'6px 8px',cursor:'pointer',fontSize:'10px',...wrap});b.type='button';b.addEventListener('click',()=>{input.value=question;ask({question});});examples.append(b);}
 const action=app.actions.register('ask-content-assistant',ask);
 app.onCleanup(()=>{disposed=true;revision++;action.remove();form.removeEventListener('submit',submit);clear.removeEventListener('click',clearFn);root.replaceChildren();});
 return{mode:'guided-natural-language',readOnly:true,examples:3,resultLimit:app.config.resultLimit};
}