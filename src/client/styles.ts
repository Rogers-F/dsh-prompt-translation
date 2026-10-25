/** DSH design-token card chrome, matching the custom-headers settings surface. */
export const css = `
.dsh-pt-card{list-style:none;border:.5px solid var(--dsw-alias-border-l4,#8883);border-radius:16px;background:var(--dsw-alias-bg-layer-3,Canvas);color:var(--dsw-alias-label-primary,CanvasText);font:inherit;transition:border-color .16s,background .16s}
.dsh-pt-card:hover{border-color:var(--dsw-alias-label-dimmed,#8886)}
.dsh-pt-card-open{background:var(--dsw-alias-bg-layer-2,Canvas);border-color:var(--dsw-alias-label-dimmed,#8886)}
.dsh-pt-card-header{width:100%;appearance:none;border:0;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer;display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:12px}
.dsh-pt-head-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.dsh-pt-card-name{font-size:15px;font-weight:600;line-height:1.4}
.dsh-pt-card-description{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#778)}
.dsh-pt-chevron{flex:none;color:var(--dsw-alias-label-tertiary,#778);transition:transform .16s}.dsh-pt-chevron-open{transform:rotate(180deg)}
.dsh-pt-tag{border-radius:999px;padding:1px 8px;font-size:11px;line-height:17px;background:var(--dsw-alias-bg-module-platform,#8882);color:var(--dsw-alias-label-secondary,#778)}
.dsh-pt-card-body{border-top:.5px solid var(--dsw-alias-border-l2,#8884);margin:0 16px;padding-bottom:8px}
.dsh-pt-card-body[hidden]{display:none}
.dsh-pt-fields{border:0;margin:0;padding:16px 0;display:grid;gap:16px;min-width:0}
.dsh-pt-fields label,.dsh-pt-popover label{display:flex;align-items:center;gap:10px;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-secondary,inherit)}
.dsh-pt-fields label{flex-wrap:wrap}
.dsh-pt-fields select,.dsh-pt-fields input:not([type=checkbox]),.dsh-pt-popover select{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l2,#8886);border-radius:8px;padding:7px 10px;background:var(--dsw-alias-bg-layer-1,Canvas);color:var(--dsw-alias-label-primary,CanvasText);font:inherit;font-size:13px;max-width:100%;min-height:34px}
.dsh-pt-fields input:not([type=checkbox]){width:280px}.dsh-pt-fields select{min-width:150px}
.dsh-pt-fields input[type=checkbox],.dsh-pt-popover input[type=checkbox]{accent-color:var(--dsw-alias-brand-primary,#526cd9);width:15px;height:15px;margin:0}
.dsh-pt-row{display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.dsh-pt-fields details{font-size:13px;color:var(--dsw-alias-label-secondary,inherit)}.dsh-pt-fields summary{cursor:pointer}.dsh-pt-fields details label{margin-top:12px}
.dsh-pt-help,.dsh-pt-fields small{font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary,#778);margin:0 0 12px}
.dsh-pt-card-footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:12px 0 4px;border-top:.5px solid var(--dsw-alias-border-l2,#8884);flex-wrap:wrap}
.dsh-pt-error{flex:1;min-width:0;margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-error,#d44)}
.dsh-pt-button{appearance:none;border:1px solid var(--dsw-alias-border-l2,#8884);border-radius:8px;padding:5px 14px;font:inherit;font-size:13px;line-height:1.5;cursor:pointer;background:none;color:var(--dsw-alias-label-secondary,CanvasText)}
.dsh-pt-button-primary{background:var(--dsw-alias-label-primary,#233);color:var(--dsw-alias-bg-layer-3,#fff);border-color:transparent}
.dsh-pt-button:disabled{opacity:.4;cursor:default}
.dsh-pt-card button:focus-visible,.dsh-pt-quick button:focus-visible,.dsh-pt-card select:focus-visible,.dsh-pt-popover select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#526cd9);outline-offset:2px}
.dsh-pt-seat{display:inline-flex;align-items:center}
.dsh-pt-quick{position:relative;display:inline-flex;color:var(--dsw-alias-label-secondary,inherit)}
.dsh-pt-quick>button{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;flex:none;border:0;background:transparent;color:inherit;padding:6px;border-radius:8px;cursor:pointer}
.dsh-pt-quick>button svg{width:20px;height:20px}.dsh-pt-quick>button:hover{background:var(--dsw-alias-bg-module-platform,#8882)}.dsh-pt-quick>button.dsh-pt-active{color:var(--dsw-alias-brand-primary,#526cd9)}
.dsh-pt-popover{position:absolute;bottom:calc(100% + 10px);left:0;z-index:100;width:300px;box-sizing:border-box;max-width:calc(100vw - 32px);padding:14px;display:grid;gap:12px;border:.5px solid var(--dsw-alias-border-l2,#8884);border-radius:12px;background:var(--dsw-alias-bg-layer-3,Canvas);color:var(--dsw-alias-label-primary,CanvasText);box-shadow:0 8px 28px #0002}
.dsh-pt-language-row{display:grid;grid-template-columns:minmax(0,1fr) 16px minmax(0,1fr);gap:8px;align-items:center}
.dsh-pt-language-compact{min-width:0}.dsh-pt-language-compact select{width:100%;min-width:0;padding:6px 8px}.dsh-pt-arrow{text-align:center;color:var(--dsw-alias-label-tertiary,#778)}
.dsh-pt-popover .dsh-pt-scope{font-size:10px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#778)}
.dsh-pt-popover [role=alert]{font-size:12px;margin:0;color:var(--dsw-alias-label-error,#d44)}
@media(max-width:480px){.dsh-pt-fields input:not([type=checkbox]){width:100%}.dsh-pt-row{gap:10px}.dsh-pt-popover{width:280px}}
.dsh-pt-inline{display:block;margin:2px 0 10px;padding-left:8px;border-left:2px solid var(--dsw-alias-border-l2,#8884);font-size:13px;line-height:1.6;color:var(--dsw-alias-label-tertiary,#778);white-space:pre-wrap;word-break:break-word;cursor:default}
.dsh-pt-inline-idle{opacity:.65;cursor:pointer;text-decoration:underline dotted}
.dsh-pt-selection{position:fixed;z-index:2147483000;max-width:340px;padding:10px 28px 10px 12px;border-radius:10px;border:.5px solid var(--dsw-alias-border-l2,#8884);background:var(--dsw-alias-bg-layer-3,Canvas);color:var(--dsw-alias-label-primary,CanvasText);box-shadow:0 8px 28px #0003;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word}
.dsh-pt-selection-body{max-height:280px;overflow:auto}
.dsh-pt-selection-close{position:absolute;top:4px;right:6px;border:0;background:none;color:var(--dsw-alias-label-tertiary,#778);font-size:15px;line-height:1;cursor:pointer;padding:2px}
.dsh-pt-frame{position:fixed;right:12px;bottom:12px;z-index:2147482000;display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:auto;font:12px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
.dsh-pt-badge{border:1px solid var(--dsw-alias-border-l2,#3a3a3a);border-radius:999px;padding:3px 10px;cursor:pointer;font:inherit;background:var(--dsw-specific-menu,#232323);color:var(--dsw-alias-label-tertiary,#9a9a9a)}
.dsh-pt-badge-on{color:var(--dsw-alias-label-primary,#e6e6e6)}
.dsh-pt-panel{width:300px;max-width:calc(100vw - 32px);box-sizing:border-box;padding:12px;display:grid;gap:10px;border:.5px solid var(--dsw-alias-border-l2,#8884);border-radius:12px;background:var(--dsw-alias-bg-layer-3,Canvas);color:var(--dsw-alias-label-primary,CanvasText);box-shadow:0 8px 28px #0003;font-size:13px;line-height:1.5}
.dsh-pt-panel label{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dsw-alias-label-secondary,inherit)}
.dsh-pt-panel input[type=checkbox]{accent-color:var(--dsw-alias-brand-primary,#526cd9);width:15px;height:15px;margin:0}
.dsh-pt-panel select{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l2,#8886);border-radius:8px;padding:6px 8px;background:var(--dsw-alias-bg-layer-1,Canvas);color:var(--dsw-alias-label-primary,CanvasText);font:inherit;font-size:13px;min-width:0;flex:1 1 auto}
.dsh-pt-panel-head{display:flex;align-items:center;justify-content:space-between}
.dsh-pt-panel-close{border:0;background:none;color:var(--dsw-alias-label-tertiary,#778);font-size:16px;line-height:1;cursor:pointer;padding:0 2px}
.dsh-pt-panel-row{display:flex;align-items:center;gap:6px}
.dsh-pt-panel-note{margin:0;font-size:11px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#778)}
.dsh-pt-panel-result{margin:0;padding:6px 8px;border-radius:8px;background:var(--dsw-alias-bg-module-platform,#8881);font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary,inherit);word-break:break-word}
.dsh-pt-panel-error{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-error,#d44)}
`
