import React, { useState } from 'react';
import { Alert, Badge, Button, Card, Checkbox, EmptyState, ErrorState, FormField, Input, Modal, Select, Skeleton, Stepper, Table, Tabs, Textarea, Toast, Tooltip } from './components';

export default function DesignSystemPage() {
  const [tab, setTab] = useState('components');
  const [modal, setModal] = useState(false);
  return <main id="main-content" className="ds-showcase page-wrap">
    <p className="ds-eyebrow">CareBridge UI library</p>
    <h1>Design system</h1>
    <p>Accessible interface building blocks in light and dark themes.</p>
    <Tabs label="Showcase sections" value={tab} onChange={setTab} items={[{ value: 'components', label: 'Components' }, { value: 'patterns', label: 'Patterns' }]} />
    <div className="ds-showcase-grid">
      <Card title="Actions and status"><div className="ds-showcase-row"><Button>Primary</Button><Button variant="secondary">Secondary</Button><Button variant="danger">Danger</Button><Button variant="ghost">Ghost</Button><Button loading>Saving</Button></div><div className="ds-showcase-row"><Badge tone="success">Verified in simulation</Badge><Badge tone="warning">Needs review</Badge><Badge tone="danger">Error</Badge><Badge tone="info">Information</Badge></div></Card>
      <Card title="Form controls"><div className="ds-showcase-form"><FormField id="sample-input" label="Name" hint="Shown on the account profile"><Input placeholder="Enter a name" /></FormField><FormField id="sample-select" label="Status"><Select defaultValue=""><option value="" disabled>Choose one</option><option>Active</option></Select></FormField><FormField id="sample-text" label="Notes"><Textarea rows={3} placeholder="Add a note" /></FormField><Checkbox label="I have reviewed this synthetic record" /></div></Card>
      <Card title="Feedback"><Alert title="Information">Decision support only. A clinician must review.</Alert><Alert tone="warning" title="Check details">Some information is out of date.</Alert><ErrorState title="Unable to load" /><EmptyState title="No results yet">Adjust the search or start a new assessment.</EmptyState></Card>
      <Card title="Data display"><Table label="Example" columns={[{ key: 'name', label: 'Facility', sortable: true }, { key: 'status', label: 'Status' }]} rows={[{ id: '1', name: 'Example facility', status: 'Illustrative only' }]} /></Card>
      {tab === 'patterns' && <Card title="Progress and help"><Stepper steps={['Patient details', 'Assessment', 'Confirm urgency', 'Ranked facilities', 'Send referral']} currentStep={2} /><Tooltip label="More about this value">Additional context</Tooltip><Skeleton /><Button onClick={() => setModal(true)}>Open modal</Button><Toast message="Changes saved" onDismiss={() => {}} /></Card>}
    </div>
    <Modal open={modal} title="Review details" onClose={() => setModal(false)}><p>Dialog focus is contained while this window is open.</p><Button onClick={() => setModal(false)}>Close</Button></Modal>
  </main>;
}
