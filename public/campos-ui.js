'use strict';
(() => {
    let frame;
    const iconeArquivo='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V3m-4 4 4-4 4 4M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/></svg>';
    function arquivos(){
        document.querySelectorAll('input[type=file]').forEach(input=>{
            if(!input.classList.contains('crm-file-native')){
                const wrap=document.createElement('div');wrap.className='crm-file-picker';
                const button=document.createElement('button');button.type='button';button.className='crm-upload-selector';
                const foto=/image/.test(input.accept)&&!/pdf|xml|doc/.test(input.accept);button.innerHTML=iconeArquivo+'<span>'+(foto?'Selecionar foto':'Selecionar arquivo')+'</span>';
                const name=document.createElement('span');name.className='crm-upload-name';name.setAttribute('aria-live','polite');
                input.before(wrap);wrap.append(input,button,name);input.classList.add('crm-file-native');
                button.addEventListener('click',e=>{e.preventDefault();if(!input.disabled)input.click();});
                input.addEventListener('change',()=>{input.dataset.uploadInvalido='';atualizar();});input.addEventListener('invalid',e=>{e.preventDefault();button.focus();input.dataset.uploadInvalido='true';if(name.textContent!=='Selecione um arquivo.'){name.textContent='Selecione um arquivo.';name.hidden=false;}});
            }
            const wrap=input.parentElement,button=wrap.querySelector('.crm-upload-selector'),name=wrap.querySelector('.crm-upload-name');
            const texto=Array.from(input.files||[]).map(f=>f.name).join(', ')||(input.dataset.uploadInvalido?'Selecione um arquivo.':'');
            if(name.textContent!==texto)name.textContent=texto;if(name.title!==texto)name.title=texto;
            if(name.hidden!==!texto)name.hidden=!texto;if(button.disabled!==input.disabled)button.disabled=input.disabled;
        });
    }
    function ajustar(campo) {
        if (!campo.getClientRects().length) return;
        campo.style.setProperty('height', 'auto', 'important');
        const estilo = getComputedStyle(campo);
        const bordas = parseFloat(estilo.borderTopWidth) + parseFloat(estilo.borderBottomWidth);
        campo.style.setProperty('height', Math.max(48, campo.scrollHeight + bordas) + 'px', 'important');
    }
    function atualizar() {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            document.querySelectorAll('textarea[data-autosize]').forEach(ajustar);
            arquivos();
        });
    }
    document.addEventListener('input', evento => {
        if (evento.target.matches('textarea[data-autosize]')) ajustar(evento.target);
    });
    window.addEventListener('resize', atualizar);
    document.addEventListener('reset', () => setTimeout(atualizar,0));
    document.addEventListener('DOMContentLoaded', () => {
        new MutationObserver(atualizar).observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['hidden', 'open', 'class', 'disabled']
        });
        atualizar();
    });
    window.KahennaCampos={atualizarArquivos:atualizar};
})();
