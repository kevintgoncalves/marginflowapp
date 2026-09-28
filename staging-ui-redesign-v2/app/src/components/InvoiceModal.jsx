import React, {useEffect, useRef} from 'react';
import {createPortal} from 'react-dom';

// Invoice-only modal stack: retain underlying workflow state without overlapping dialogs.
const stack = [];
export default function InvoiceModal({title,open,onClose,footer,children,wide=false,className=''}) {
  const ref=useRef(null), close=useRef(onClose); close.current=onClose;
  useEffect(()=>{
    if(!open)return;
    const node=ref.current, opener=document.activeElement;
    const entry={node}; stack.push(entry);
    const refresh=()=>stack.forEach((item,index)=>{item.node.hidden=index!==stack.length-1;});
    refresh();
    const focusable=()=>[...node.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter(el=>el.getClientRects().length);
    (focusable()[0]||node).focus();
    const keys=event=>{
      if(stack.at(-1)!==entry)return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current?.();}
      if(event.key==='Tab'){
        const items=focusable(),first=items[0],last=items.at(-1);
        if(!first){event.preventDefault();node.focus();}
        else if(event.shiftKey&&(document.activeElement===first||document.activeElement===node)){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    document.addEventListener('keydown',keys,true);
    return()=>{document.removeEventListener('keydown',keys,true);stack.splice(stack.indexOf(entry),1);refresh();if(opener?.isConnected)opener.focus();};
  },[open]);
  if(!open)return null;
  return createPortal(<div ref={ref} tabIndex={-1} className="modal-backdrop unified-invoice-overlay">
    <div className={`app-modal unified-invoice-modal ${wide?'wide':''} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><h2>{title}</h2><button className="icon" aria-label={`Close ${title}`} onClick={onClose} type="button">×</button></div>
      <div className="modal-body">{children}</div>{footer&&<div className="modal-footer">{footer}</div>}
    </div>
  </div>,document.body);
}
