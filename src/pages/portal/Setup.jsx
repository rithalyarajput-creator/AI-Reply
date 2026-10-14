import { useState } from 'react';
import { api } from '../../api.js';
import {
  Badge, Empty, Err, Field, Modal, PageHead, useLoad,
} from '../../components/ui.jsx';

const blank = () => ({ id: 'start', text: '', options: [] });

function Editor({ flow, onClose, onSaved }) {
  const [name, setName] = useState(flow?.name || '');
  const [keyword, setKeyword] = useState(flow?.trigger_keyword || '');
  const [nodes, setNodes] = useState(flow?.nodes?.length ? flow.nodes : [blank()]);
  const [error, setError] = useState('');

  const upd = (i, patch) => setNodes(nodes.map((n, j) => (j === i ? { ...n, ...patch } : n)));
  const addNode = () => setNodes([...nodes, { id: `step${nodes.length + 1}`, text: '', options: [] }]);
  const addOpt = (i) => upd(i, { options: [...nodes[i].options, { title: '', next: '' }].slice(0, 3) });
  const updOpt = (i, k, patch) => upd(i, { options: nodes[i].options.map((o, j) => (j === k ? { ...o, ...patch } : o)) });
  const delOpt = (i, k) => upd(i, { options: nodes[i].options.filter((_, j) => j !== k) });
  const delNode = (i) => setNodes(nodes.filter((_, j) => j !== i));

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const body = { name, trigger_keyword: keyword, nodes };
      if (flow) await api(`/portal/flows/${flow.id}`, { method: 'PATCH', body });
      else await api('/portal/flows', { method: 'POST', body });
      onSaved();
    } catch (err) { setError(err.message); }
  };

  return (
    <Modal title={flow ? 'Edit flow' : 'New flow'} onClose={onClose} wide>
      <form onSubmit={save}>
        <div className="form-grid">
          <Field label="Flow name"><input value={name} onChange={(e) => setName(e.target.value)} required /></Field>
          <Field label="Starts when customer sends" hint="Example: menu"><input value={keyword} onChange={(e) => setKeyword(e.target.value)} /></Field>
        </div>
        {nodes.map((n, i) => (
          <div className="card node" key={n.id}>
            <div className="row nomargin">
              <b>Step {i + 1}{i === 0 ? ' (first message)' : ''}</b>
              <input className="idbox" value={n.id} onChange={(e) => upd(i, { id: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') })} aria-label="Step ID" />
              {i > 0 && <button type="button" className="btn ghost small" onClick={() => delNode(i)}>Remove step</button>}
            </div>
            <Field label="Message"><textarea rows="2" value={n.text} onChange={(e) => upd(i, { text: e.target.value })} required /></Field>
            {n.options.map((o, k) => (
              <div className="row" key={k}>
                <input placeholder="Button text (max 20)" maxLength={20} value={o.title} onChange={(e) => updOpt(i, k, { title: e.target.value })} />
                <select value={o.next} onChange={(e) => updOpt(i, k, { next: e.target.value })}>
                  <option value="">End of flow</option>
                  {nodes.filter((x) => x.id !== n.id).map((x) => <option key={x.id} value={x.id}>Go to: {x.id}</option>)}
                </select>
                <button type="button" className="btn ghost small" onClick={() => delOpt(i, k)}>x</button>
              </div>
            ))}
            {n.options.length < 3 && <button type="button" className="btn ghost small" onClick={() => addOpt(i)}>+ Button</button>}
          </div>
        ))}
        <button type="button" className="btn ghost" onClick={addNode}>+ Add step</button>
        <Err error={error} />
        <div className="row">
          <button className="btn">Save flow</button>
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Setup() {
  const [d, load, error] = useLoad(() => api('/portal/flows'), []);
  const [edit, setEdit] = useState(undefined);
  const toggle = async (f) => { await api(`/portal/flows/${f.id}`, { method: 'PATCH', body: { enabled: !f.enabled } }); load(); };
  const del = async (f) => { if (window.confirm(`Delete flow "${f.name}"?`)) { await api(`/portal/flows/${f.id}`, { method: 'DELETE' }); load(); } };
  return (
    <>
      <PageHead title="Setup: Flows" sub="Button menus. The customer taps an option and gets the next set of options, with no typing.">
        <button className="btn" onClick={() => setEdit(null)}>New flow</button>
      </PageHead>
      <Err error={error} />
      {d && !d.flows.length && <Empty>No flows yet. Example: "How can we help?" with buttons Pricing, Support and Talk to a person.</Empty>}
      <div className="grid cards">
        {d?.flows.map((f) => (
          <div className="card" key={f.id}>
            <h3>{f.name}</h3>
            <p className="muted small">Starts on: {f.trigger_keyword ? <code>{f.trigger_keyword}</code> : 'not set'} · {f.nodes.length} steps</p>
            <Badge value={f.enabled ? 'active' : 'disabled'} />
            <div className="row">
              <button className="btn ghost small" onClick={() => setEdit(f)}>Edit</button>
              <button className="btn ghost small" onClick={() => toggle(f)}>{f.enabled ? 'Turn off' : 'Turn on'}</button>
              <button className="btn ghost small" onClick={() => del(f)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
      {edit !== undefined && <Editor flow={edit} onClose={() => setEdit(undefined)} onSaved={() => { setEdit(undefined); load(); }} />}
    </>
  );
}
