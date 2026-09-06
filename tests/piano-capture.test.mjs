import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { recordPiano } = await loadTs('../lib/piano-capture.ts');

for (const rawScene of [false,true]) test(`Owner ${rawScene ? 'direct WebGL' : 'composited'} capture replaces live transcription and cleans up on abort`,async()=>{
  const previous={document:globalThis.document,MediaRecorder:globalThis.MediaRecorder};
  let renderedScore,restored=0,disconnected=0,stopped=0,directStreams=0;
  const stream={getAudioTracks:()=>[],getTracks:()=>[],addTrack:()=>{}};
  const fakeDocument={createElement:()=>({getContext:()=>({}),captureStream:()=>stream})};
  Object.defineProperty(globalThis,'document',{value:fakeDocument,writable:true,configurable:true});
  globalThis.MediaRecorder=class {
    static isTypeSupported(){return true;}
    state='inactive';
    start(){this.state='recording';}
    stop(){this.state='inactive';this.onstop?.();}
  };
  const world={sheet:{setScore:score=>{renderedScore=score;}},slow:true,
    renderer:{domElement:{captureStream:fps=>{assert.equal(fps,30);directStreams++;return stream;}}},
    beginCapture:()=>()=>{restored++;}};
  const audio={context:{currentTime:0},capture:()=>({stream,disconnect:()=>{disconnected++;}})};
  const transport={play:()=>{},stop:()=>{stopped++;}};
  const score={title:'Selected MIDI',duration:10};
  const abort=new AbortController();
  try {
    const pending=recordPiano(world,audio,transport,score,{signal:abort.signal,onProgress:()=>{},onScene:()=>{},onView:()=>{},rawScene});
    assert.equal(directStreams,rawScene ? 1 : 0);
    assert.equal(renderedScore,score,'capture must not retain the preceding manual-transcription pages');
    abort.abort();
    await assert.rejects(pending,{name:'AbortError'});
    assert.equal(restored,1);
    assert.equal(disconnected,1);
    assert.equal(stopped,1);
    assert.equal(world.slow,true);
    assert.equal(world.onFrame,undefined);
  } finally {
    abort.abort();
    if(previous.document===undefined)delete globalThis.document;else globalThis.document=previous.document;
    if(previous.MediaRecorder===undefined)delete globalThis.MediaRecorder;else globalThis.MediaRecorder=previous.MediaRecorder;
  }
});
