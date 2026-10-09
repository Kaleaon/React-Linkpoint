import { beforeEach, describe, expect, it } from 'vitest';
import { CHAT_SOURCE, CHAT_TYPE, RlvHandler, RlvRet, RlvCommand, parseCommand, rlvFailed, rlvSucceeded, type RlvEnvironment } from '../rlv-handler';

const OBJ = '11111111-1111-1111-1111-111111111111';
const OBJ2 = '22222222-2222-2222-2222-222222222222';
const BOB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ME = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

let sent: Array<{ text: string; channel: number; type: number }>;
let env: RlvEnvironment;
let rlv: RlvHandler;
beforeEach(() => {
  sent = [];
  env = { selfId: () => ME, sendChat: (text, channel, type) => { sent.push({ text, channel, type }); } };
  rlv = new RlvHandler(env);
  rlv.setEnabled(true);
});
const run = (command: string, object = OBJ) => rlv.processCommand(object, command);

describe('command grammar (RlvCommand::parseCommand)', () => {
  it.each([
    ['detach=n', { behaviour: 'detach', option: '', param: 'n' }],
    ['sendim:abc=add', { behaviour: 'sendim', option: 'abc', param: 'add' }],
    ['getstatus:tp;|=1234', { behaviour: 'getstatus', option: 'tp;|', param: '1234' }],
    ['tpto:Region/1/2/3;1.5=force', { behaviour: 'tpto', option: 'Region/1/2/3;1.5', param: 'force' }],
    ['clear', { behaviour: 'clear', option: '', param: '' }],
    ['clear=tp', { behaviour: 'clear', option: '', param: 'tp' }],
  ])('parses %s', (text, expected) => expect(parseCommand(text)).toEqual(expected));

  it.each(['', '=n', ':x=n', 'detach', 'detach=', 'detach:opt', 'clear:tp'])('rejects %j', (text) => expect(parseCommand(text)).toBeNull());

  it('classifies the param: n/add, y/rem, force, a channel number, or invalid', () => {
    const type = (c: string) => new RlvCommand(OBJ, c).type;
    expect([type('detach=n'), type('detach=add'), type('detach=y'), type('detach=rem'), type('fly=force'), type('version=2222'), type('clear'), type('x=maybe')])
      .toEqual(['add', 'add', 'remove', 'remove', 'force', 'reply', 'clear', 'unknown']);
    expect(run('detach=maybe')).toBe(RlvRet.FAILED_SYNTAX);
  });

  it('knows which forms exist and resolves strict suffixes and synonyms', () => {
    expect(new RlvCommand(OBJ, 'recvchat_sec=n')).toMatchObject({ name: 'recvchat', strict: true });
    expect(new RlvCommand(OBJ, 'detach_sec=n').name).toBeNull(); // detach has no strict form
    expect(new RlvCommand(OBJ, 'touchfar=n').name).toBe('fartouch');
    expect(new RlvCommand(OBJ, 'version=n').name).toBeNull(); // reply-only behaviour is not a restriction
    expect(run('notacommand=n')).toBe(RlvRet.FAILED_PARAM);
    expect(run('notacommand=force')).toBe(RlvRet.FAILED_UNKNOWN);
  });
});

describe('restrictions per object', () => {
  it('adds, ignores duplicates and removes', () => {
    expect(run('sendchat=n')).toBe(RlvRet.SUCCESS);
    expect(rlv.hasBehaviour('sendchat')).toBe(true);
    expect(run('sendchat=n')).toBe(RlvRet.SUCCESS_DUPLICATE);
    expect(run('sendchat=y')).toBe(RlvRet.SUCCESS);
    expect(rlv.hasBehaviour('sendchat')).toBe(false);
    expect(run('sendchat=y')).toBe(RlvRet.SUCCESS_UNSET);
    expect(rlv.objects.size).toBe(0);
  });

  it('is reference counted across objects', () => {
    run('fly=n', OBJ); run('fly=n', OBJ2);
    run('fly=y', OBJ);
    expect(rlv.hasBehaviour('fly')).toBe(true);
    run('fly=y', OBJ2);
    expect(rlv.hasBehaviour('fly')).toBe(false);
  });

  it('refuses an option on behaviours that take none, and a bad uuid on exceptions', () => {
    expect(run('fly:3=n')).toBe(RlvRet.FAILED_OPTION);
    expect(rlv.hasBehaviour('fly')).toBe(false);
    expect(run('recvchat:notauuid=n')).toBe(RlvRet.FAILED_OPTION);
    expect(rlv.objects.size).toBe(0);
  });

  it('@clear removes everything of that object, or only commands containing the filter', () => {
    run('sendchat=n'); run('recvchat=n'); run('fly=n'); run('tplm=n', OBJ2);
    run('clear=chat');
    expect(rlv.hasBehaviour('sendchat')).toBe(false);
    expect(rlv.hasBehaviour('recvchat')).toBe(false);
    expect(rlv.hasBehaviour('fly')).toBe(true);
    run('clear');
    expect(rlv.hasBehaviour('fly')).toBe(false);
    expect(rlv.hasBehaviour('tplm')).toBe(true); // another object's restriction stays
  });

  it('lets only one object hold @setenv, @setdebug and @setcam', () => {
    expect(run('setenv=n', OBJ)).toBe(RlvRet.SUCCESS);
    expect(run('setenv=n', OBJ2)).toBe(RlvRet.FAILED_LOCK);
  });

  it('refuses commands from a blocked object except removals', () => {
    run('fly=n');
    rlv.addBlockedObject(OBJ);
    expect(run('jump=n')).toBe(RlvRet.FAILED_BLOCKED);
    expect(run('fly=y')).toBe(RlvRet.SUCCESS);
  });

  it('marks deprecated synonyms', () => {
    expect(run('camunlock=n')).toBe(RlvRet.SUCCESS_DEPRECATED);
    expect(rlv.hasBehaviour('setcam_unlock')).toBe(true);
  });
});

describe('object chat', () => {
  it('only llOwnerSay with a leading @ is a command line, split on commas and lower-cased', () => {
    expect(rlv.handleObjectChat(OBJ, '@Fly=n,SendChat=n', CHAT_TYPE.OWNER)).toBe(true);
    expect(rlv.hasBehaviour('fly') && rlv.hasBehaviour('sendchat')).toBe(true);
    expect(rlv.handleObjectChat(OBJ, '@jump=n', CHAT_TYPE.NORMAL)).toBe(false);
    expect(rlv.handleObjectChat(OBJ, '@j', CHAT_TYPE.OWNER)).toBe(false); // 3 characters or fewer
    expect(rlv.hasBehaviour('jump')).toBe(false);
  });

  it('does nothing while RLV is off', () => {
    rlv.setEnabled(false);
    expect(rlv.handleObjectChat(OBJ, '@fly=n', CHAT_TYPE.OWNER)).toBe(false);
    expect(rlv.hasBehaviour('fly')).toBe(false);
  });

  it('turning RLV off forgets every restriction', () => {
    run('fly=n');
    rlv.setEnabled(false);
    rlv.setEnabled(true);
    expect(rlv.hasBehaviour('fly')).toBe(false);
  });
});

describe('exceptions, strict and permissive', () => {
  it('lets an exception through a restriction', () => {
    run('recvchat=n'); run(`recvchat:${BOB}=n`);
    expect(rlv.isException('recvchat', BOB)).toBe(true);
    expect(rlv.hasBehaviour('recvchat')).toBe(true); // the exception is not reference counted
    run(`recvchat:${BOB}=y`);
    expect(rlv.isException('recvchat', BOB)).toBe(false);
  });

  it('a strict restriction needs the exception from every object holding it', () => {
    run('recvchat_sec=n', OBJ); run('recvchat_sec=n', OBJ2);
    run(`recvchat:${BOB}=n`, OBJ);
    expect(rlv.isException('recvchat', BOB)).toBe(false); // OBJ2 holds the restriction and has not excepted BOB
    run(`recvchat:${BOB}=n`, OBJ2);
    expect(rlv.isException('recvchat', BOB)).toBe(true);
  });

  it('@permissive makes exceptions need the same from every holder', () => {
    run('permissive=n');
    expect(rlv.hasBehaviour('permissive')).toBe(true);
    expect(rlv.isPermissive('recvchat')).toBe(false);
  });

  it('exceptions compare uuids case-insensitively', () => {
    run('recvim=n'); run(`recvim:${BOB.toUpperCase()}=n`);
    expect(rlv.canReceiveIM(BOB)).toBe(true);
  });
});

describe('reply commands', () => {
  it('answers @version, @versionnew and @versionnum on the channel, shouted', () => {
    run('version=2222'); run('versionnew=2223'); run('versionnum=2224'); run('versionnum:impl=2225');
    expect(sent).toEqual([
      { text: 'RestrainedLife viewer v3.4.3 (RLVa 2.4.2)', channel: 2222, type: CHAT_TYPE.SHOUT },
      { text: 'RestrainedLove viewer v3.4.3 (RLVa 2.4.2)', channel: 2223, type: CHAT_TYPE.SHOUT },
      { text: '3040300', channel: 2224, type: CHAT_TYPE.SHOUT },
      { text: '2040213', channel: 2225, type: CHAT_TYPE.SHOUT },
    ]);
  });

  it('refuses channel 0, negative channels and the debug channel', () => {
    expect(run('version=0')).toBe(RlvRet.FAILED_PARAM);
    expect(run('version=-5')).toBe(RlvRet.FAILED_PARAM);
    expect(run('version=2147483647')).toBe(RlvRet.FAILED_PARAM);
    expect(sent).toEqual([]);
  });

  it('@getstatus lists the object\'s own restrictions with a filter and separator; @getstatusall lists everyone\'s', () => {
    run('detach=n'); run('sendchat=n'); run(`recvim:${BOB}=n`); run('fly=n', OBJ2);
    run('getstatus=11');
    run('getstatus:chat=12');
    run('getstatus:;|=13');
    run('getstatusall=14');
    expect(sent.map((s) => s.text)).toEqual([`/detach/sendchat/recvim:${BOB}`, '/sendchat', `|detach|sendchat|recvim:${BOB}`, `/detach/sendchat/recvim:${BOB}/fly`]);
  });

  it('an object with no rules gets an empty status', () => {
    run('getstatus=11');
    expect(sent).toEqual([{ text: '', channel: 11, type: CHAT_TYPE.SHOUT }]);
  });

  it('@getgroup and @getsitid use the viewer, with the viewer\'s fallbacks', () => {
    run('getgroup=1'); run('getsitid=2');
    env.activeGroupName = () => 'Cats'; env.sitObjectId = () => OBJ2;
    run('getgroup=1'); run('getsitid=2');
    expect(sent.map((s) => s.text)).toEqual(['none', '00000000-0000-0000-0000-000000000000', 'Cats', OBJ2]);
  });

  it('@getcommand lists known commands, filtered by name and type', () => {
    run('getcommand:fly;force=7');
    run('getcommand:getstatus;reply;,=8');
    expect(sent[0].text).toBe('fly');
    expect(sent[1].text).toBe('getstatus,getstatusall');
    expect(run('getcommand:x;bogus=9')).toBe(RlvRet.FAILED_OPTION);
  });

  it('answers unsupported queries with an empty reply so scripts do not hang', () => {
    expect(run('getoutfit=5')).toBe(RlvRet.FAILED_UNSUPPORTED);
    expect(sent).toEqual([{ text: '', channel: 5, type: CHAT_TYPE.SHOUT }]);
    expect(rlvFailed(RlvRet.FAILED_UNSUPPORTED)).toBe(true);
    expect(rlvSucceeded(RlvRet.SUCCESS_UNSET)).toBe(true);
  });

  it('reports camera modifiers set by @setcam_*', () => {
    run('getcam_fovmax=3');
    run('setcam_fovmax:1.25=n');
    run('getcam_fovmax=3');
    expect(sent.map((s) => s.text)).toEqual(['', '1.250']);
  });
});

describe('chat filtering', () => {
  it('@sendchat lets through emotes (shortened), /commands up to 6 characters and ((OOC))', () => {
    run('sendchat=n');
    const send = (t: string) => rlv.prepareOutgoingChat(t, CHAT_TYPE.NORMAL, 0)?.text;
    expect(send('hello there')).toBe('...');
    expect(send('/me smiles at you. And then more text')).toBe('/me smiles at you.');
    expect(send('/me smiles and goes on and on forever')).toBe('/me smiles and goes ');
    expect(send('/me says "hi"')).toBe('...');
    expect(send('/shrug')).toBe('/shrug');
    expect(send('/shrugged!')).toBe('...');
    expect(send('((brb))')).toBe('((brb))');
    expect(send('(())')).toBe('(())');
    expect(send('((a)')).toBe('...'); // must end with ))
    expect(send('(x)')).toBe('...'); // under 4 characters
  });

  it('@emote lifts the emote shortening', () => {
    run('sendchat=n'); run('emote=n');
    expect(rlv.prepareOutgoingChat('/me smiles at you for a very long time indeed', CHAT_TYPE.NORMAL, 0)?.text).toBe('/me smiles at you for a very long time indeed');
  });

  it('the ellipsis can be turned off', () => {
    run('sendchat=n');
    rlv.showEllipsis = false;
    expect(rlv.prepareOutgoingChat('hi there', CHAT_TYPE.NORMAL, 0)?.text).toBe('');
  });

  it('@chatshout/@chatnormal/@chatwhisper limit the volume', () => {
    run('chatnormal=n');
    expect([CHAT_TYPE.WHISPER, CHAT_TYPE.NORMAL, CHAT_TYPE.SHOUT].map((t) => rlv.checkChatVolume(t))).toEqual([0, 0, 0]);
    run('chatnormal=y'); run('chatshout=n');
    expect([CHAT_TYPE.WHISPER, CHAT_TYPE.NORMAL, CHAT_TYPE.SHOUT].map((t) => rlv.checkChatVolume(t))).toEqual([0, 1, 1]);
    run('chatshout=y'); run('chatwhisper=n');
    expect([CHAT_TYPE.WHISPER, CHAT_TYPE.NORMAL, CHAT_TYPE.SHOUT].map((t) => rlv.checkChatVolume(t))).toEqual([1, 1, 2]);
  });

  it('@redirchat sends public chat to the channel instead of saying it, but only chat @sendchat would have filtered', () => {
    run('redirchat:7=n');
    expect(rlv.prepareOutgoingChat('hello world', CHAT_TYPE.NORMAL, 0)).toBeNull();
    expect(sent).toEqual([{ text: 'hello world', channel: 7, type: CHAT_TYPE.SHOUT }]);
    sent.length = 0;
    // without @sendchat the OOC form would not be filtered, so it is not redirected either
    expect(rlv.prepareOutgoingChat('((ooc text))', CHAT_TYPE.NORMAL, 0)).toEqual({ text: '((ooc text))', type: 1 });
    expect(sent).toEqual([]);
  });

  it('@rediremote redirects emotes', () => {
    run('rediremote:8=n');
    expect(rlv.prepareOutgoingChat('/me waves', CHAT_TYPE.NORMAL, 0)).toBeNull();
    expect(sent[0]).toMatchObject({ text: '/me waves', channel: 8 });
  });

  it('@redirchat needs a valid reply channel', () => {
    expect(run('redirchat=n')).toBe(RlvRet.FAILED_OPTION);
    expect(run('redirchat:0=n')).toBe(RlvRet.FAILED_OPTION);
  });

  it('@sendchannel blocks other channels unless excepted, and the debug channel under @sendchat', () => {
    run('sendchannel=n'); run('sendchannel:5=n');
    expect(rlv.prepareOutgoingChat('x', CHAT_TYPE.NORMAL, 4)).toBeNull();
    expect(rlv.prepareOutgoingChat('x', CHAT_TYPE.NORMAL, 5)).toEqual({ text: 'x', type: 1 });
    run('sendchannel=y'); run('sendchannel:5=y'); run('sendchat=n');
    expect(rlv.prepareOutgoingChat('x', CHAT_TYPE.NORMAL, 2147483647)).toBeNull();
  });

  it('@recvchat hides other avatars\' chat unless they are an exception; our own and owner-say are left alone', () => {
    run('recvchat=n'); run(`recvchat:${BOB}=n`);
    const incoming = (fromId: string, text: string, sourceType: number = CHAT_SOURCE.AGENT, chatType: number = CHAT_TYPE.NORMAL) => rlv.filterIncomingChat({ fromId, fromName: 'Someone', text, chatType, sourceType }).text;
    expect(incoming('cccccccc-cccc-cccc-cccc-cccccccccccc', 'hello')).toBe('...');
    expect(incoming(BOB, 'hello')).toBe('hello');
    expect(incoming(ME, 'hello')).toBe('hello');
    expect(incoming(OBJ, 'hello', CHAT_SOURCE.OBJECT)).toBe('...');
    expect(incoming(OBJ, '@fly=n', CHAT_SOURCE.OBJECT, CHAT_TYPE.OWNER)).toBe('@fly=n');
    expect(incoming('cccccccc-cccc-cccc-cccc-cccccccccccc', '((ooc))')).toBe('((ooc))');
  });

  it('@recvemote turns emotes into "/me ..."', () => {
    run('recvemote=n');
    expect(rlv.filterIncomingChat({ fromId: BOB, fromName: 'Bob', text: '/me dances', chatType: 1, sourceType: 1 }).text).toBe('/me ...');
    rlv.showEllipsis = false;
    expect(rlv.filterIncomingChat({ fromId: BOB, fromName: 'Bob', text: '/me dances', chatType: 1, sourceType: 1 }).text).toBeNull();
  });
});

describe('instant messages', () => {
  it('@sendim / @recvim / @startim with exceptions and the *from/*to forms', () => {
    run('sendim=n'); run('recvim=n'); run('startim=n');
    expect([rlv.canSendIM(BOB), rlv.canReceiveIM(BOB), rlv.canStartIM(BOB)]).toEqual([false, false, false]);
    expect(rlv.canStartIM(BOB, true)).toBe(true); // an open session may continue
    run(`sendim:${BOB}=n`); run(`recvim:${BOB}=n`); run(`startim:${BOB}=n`);
    expect([rlv.canSendIM(BOB), rlv.canReceiveIM(BOB), rlv.canStartIM(BOB)]).toEqual([true, true, true]);
    run('sendim=y'); run('sendim:' + BOB + '=y');
    run(`sendimto:${BOB}=n`);
    expect(rlv.canSendIM(BOB)).toBe(false);
    run('recvim=y'); run(`recvim:${BOB}=y`);
    run(`recvimfrom:${BOB}=n`);
    expect(rlv.canReceiveIM(BOB)).toBe(false);
    expect(rlv.filterIncomingIM(BOB, 'hi')).toBe('*** IM blocked by your viewer');
  });

  it('a distance range lets nearby avatars through (squared distances, min <= d <= max)', () => {
    const distances = new Map<string, number>([[BOB, 25]]);
    env.avatarDistanceSquared = (id) => distances.get(id) ?? null;
    run('recvim=n'); run('recvim:2;10=n'); // between 2 m and 10 m
    expect(rlv.canReceiveIM(BOB)).toBe(true);  // 5 m
    distances.set(BOB, 400);
    expect(rlv.canReceiveIM(BOB)).toBe(false); // 20 m
    distances.set(BOB, 1);
    expect(rlv.canReceiveIM(BOB)).toBe(false); // 1 m, inside the minimum
    expect(rlv.canReceiveIM('unknown-avatar')).toBe(false); // off-region
    run('recvim:2;10=y');
    expect(rlv.getModifier('recvimdistmin')).toBe(3.4028234663852886e38);
  });

  it('a minimum with no maximum lets anyone beyond it through', () => {
    env.avatarDistanceSquared = () => 10000;
    run('sendim=n'); run('sendim:5=n');
    expect(rlv.canSendIM(BOB)).toBe(true);
  });

  it('is not enforced while RLV is off', () => {
    run('sendim=n');
    rlv.setEnabled(false);
    expect(rlv.canSendIM(BOB)).toBe(true);
  });
});

describe('movement', () => {
  it('@fly=n blocks flying, @fly=force sets it unless another object forbids', () => {
    const state = { flying: false };
    env.setFlying = (f) => { state.flying = f; }; env.isFlying = () => state.flying;
    expect(run('fly=force')).toBe(RlvRet.SUCCESS);
    expect(state.flying).toBe(true);
    run('fly=n', OBJ2);
    expect(rlv.canFly()).toBe(false);
    expect(run('fly:true=force')).toBe(RlvRet.FAILED_LOCK);
    expect(run('fly:false=force')).toBe(RlvRet.SUCCESS);
    expect(state.flying).toBe(false);
    expect(run('fly:maybe=force')).toBe(RlvRet.FAILED_OPTION);
    // the issuing object's own @fly=n does not stop its own forced fly
    run('fly=y', OBJ2); run('fly=n', OBJ);
    expect(run('fly=force')).toBe(RlvRet.SUCCESS);
  });

  it('@unsit=n keeps a seated avatar seated, and @unsit=force stands unless another object forbids', () => {
    let sitting = true;
    env.isSitting = () => sitting; env.stand = () => { sitting = false; };
    run('unsit=n', OBJ2);
    expect(rlv.canStand()).toBe(false);
    expect(run('unsit=force', OBJ)).toBe(RlvRet.SUCCESS);
    expect(sitting).toBe(true);
    run('unsit=y', OBJ2);
    expect(run('unsit=force', OBJ)).toBe(RlvRet.SUCCESS);
    expect(sitting).toBe(false);
    run('unsit=n', OBJ2);
    expect(rlv.canStand()).toBe(true); // not sitting
  });

  it('@sit:<uuid>=force sits unless sitting is forbidden', () => {
    const sat: string[] = [];
    env.sit = (id) => { sat.push(id); return true; };
    expect(run(`sit:${OBJ2}=force`)).toBe(RlvRet.SUCCESS);
    expect(sat).toEqual([OBJ2]);
    run('sit=n', OBJ2);
    expect(run(`sit:${OBJ2}=force`)).toBe(RlvRet.FAILED_LOCK);
    expect(run('sit:nope=force')).toBe(RlvRet.FAILED_OPTION);
  });

  it('@tploc, @tplm and @tplure', () => {
    run('tploc=n'); run('tplm=n'); run('tplure=n');
    expect([rlv.canTeleportToLocation(''), rlv.canTeleportToLandmark(), rlv.canAcceptTpOffer(BOB)]).toEqual([false, false, false]);
    run(`tplure:${BOB}=n`);
    expect(rlv.canAcceptTpOffer(BOB)).toBe(true);
    run('accepttp=n');
    expect(rlv.autoAcceptTeleportOffer(OBJ2)).toBe(true);
  });

  it('@tpto goes where it is told even under the issuing object\'s own @tploc, but not another\'s', () => {
    const where: unknown[] = [];
    env.teleportToGlobal = (p, a) => where.push(['global', p, a]);
    env.teleportToRegion = (r, p, a) => where.push(['region', r, p, a]);
    run('tploc=n', OBJ);
    expect(run('tpto:256000/256000/30=force', OBJ)).toBe(RlvRet.SUCCESS);
    expect(run('tpto:Ahern/128/64/22;1.5=force', OBJ)).toBe(RlvRet.SUCCESS);
    expect(where).toEqual([['global', [256000, 256000, 30], undefined], ['region', 'Ahern', [128, 64, 22], 1.5]]);
    expect(run('tpto:Ahern/128/64=force', OBJ)).toBe(RlvRet.FAILED_OPTION);
    run('tploc=n', OBJ2);
    expect(run('tpto:Ahern/1/2/3=force', OBJ)).toBe(RlvRet.FAILED_LOCK);
  });

  it('@tplocal and @sittp limit short teleports by distance', () => {
    run('tplocal:50=n');
    const from: [number, number, number] = [100, 100, 20];
    expect(rlv.canTeleportToLocal(from, [130, 100, 20], OBJ2)).toBe(true);
    expect(rlv.canTeleportToLocal(from, [180, 100, 20], OBJ2)).toBe(false);
    run('tplocal:50=y'); run('sittp=n');
    expect(rlv.canTeleportToLocal(from, [101, 100, 20], OBJ2)).toBe(true);
    expect(rlv.canTeleportToLocal(from, [103, 100, 20], OBJ2)).toBe(false); // default sittp distance is 1.5 m
  });

  it('the smallest value wins when several objects set a distance', () => {
    run('tplocal:100=n', OBJ); run('tplocal:20=n', OBJ2);
    expect(rlv.getModifier('tplocaldist')).toBe(20);
    run('tplocal:20=y', OBJ2);
    expect(rlv.getModifier('tplocaldist')).toBe(100);
    run('tplocal:100=y', OBJ);
    expect(rlv.getModifier('tplocaldist')).toBe(256); // default again
  });
});

describe('touch, edit and sit checks', () => {
  const world = { id: OBJ2, rootId: OBJ2, isAttachment: false, isHud: false, isOwnedByYou: false, isVolume: true, distanceSquared: 4 };
  it('@touchall, @touchworld, @fartouch and the @touchme override', () => {
    expect(rlv.canTouch(world)).toBe(true);
    run('touchworld=n');
    expect(rlv.canTouch(world)).toBe(false);
    run(`touchworld:${OBJ2}=n`);
    expect(rlv.canTouch(world)).toBe(true);
    run('touchworld=y'); run(`touchworld:${OBJ2}=y`);
    run('fartouch=n');
    expect(rlv.canTouch(world)).toBe(false); // 2 m is beyond the default 1.5 m
    expect(rlv.canTouch({ ...world, distanceSquared: 1 })).toBe(true);
    run('touchall=n');
    expect(rlv.canTouch({ ...world, distanceSquared: 1 })).toBe(false);
    expect(rlv.canTouch({ ...world, isHud: true, isAttachment: true, isOwnedByYou: true, distanceSquared: 1 })).toBe(true); // HUDs are not touchall
    rlv.setObjectRoot(OBJ, OBJ2);
    run('touchme=n', OBJ);
    expect(rlv.canTouch({ ...world, distanceSquared: 1 })).toBe(true); // the object holding @touchme can be touched
  });

  it('@interact blocks everything but HUDs; @fartouch distance blocks interaction too', () => {
    run('interact=n');
    expect(rlv.canInteract(world)).toBe(false);
    expect(rlv.canInteract({ ...world, isHud: true, isAttachment: true })).toBe(true);
    run('interact=y'); run('fartouch:5=n');
    expect(rlv.canInteract({ ...world, distanceSquared: 16 })).toBe(true);
    expect(rlv.canInteract({ ...world, distanceSquared: 36 })).toBe(false);
  });

  it('@edit with an exception, @editobj and @editattach/@editworld', () => {
    run('edit=n'); run(`edit:${OBJ2}=n`);
    expect(rlv.canEdit(world)).toBe(true);
    run(`edit:${OBJ2}=y`);
    expect(rlv.canEdit(world)).toBe(false);
    run('edit=y'); run('editworld=n');
    expect(rlv.canEdit(world)).toBe(false);
    expect(rlv.canEdit({ ...world, isAttachment: true })).toBe(true);
  });

  it('@showhovertext hides text for the objects named', () => {
    run(`showhovertext:${OBJ2}=n`);
    expect(rlv.canShowHoverText({ id: OBJ2, isVolume: true, isHud: false })).toBe(false);
    expect(rlv.canShowHoverText({ id: OBJ, isVolume: true, isHud: false })).toBe(true);
    run('showhovertextworld=n');
    expect(rlv.canShowHoverText({ id: OBJ, isVolume: true, isHud: false })).toBe(false);
    expect(rlv.canShowHoverText({ id: OBJ, isVolume: true, isHud: true })).toBe(true);
  });
});

describe('names and location', () => {
  beforeEach(() => {
    env.nearbyAvatars = () => [{ id: BOB, displayName: 'Bobby Tables', legacyName: 'Robert Tables' }];
    env.locationNames = () => ({ regions: ['Ahern'], parcel: 'Sunny Cove' });
  });

  it('@shownames hides names of everyone but excepted avatars and yourself', () => {
    expect(rlv.canShowName()).toBe(true);
    run('shownames=n');
    expect(rlv.canShowName()).toBe(false);
    expect(rlv.canShowName(BOB)).toBe(false);
    expect(rlv.canShowName(ME)).toBe(true);
    run(`shownames:${BOB}=n`);
    expect(rlv.canShowName(BOB)).toBe(true);
    run(`shownames:${BOB}=y`);
    expect(rlv.filterNames('Bobby Tables waved at robert tables')).toMatch(/^(A|This|That|An|Some|Mysterious|Unidentified)[^]* waved at /);
    expect(rlv.filterNames('Bobby Tables says hi')).not.toContain('Bobby');
  });

  it('a name always maps to the same stand-in, summed over signed bytes like the viewer', () => {
    run('shownames=n');
    expect(rlv.anonym('Robert Tables')).toBe(rlv.anonym('Robert Tables'));
    // 'A' = 65, anonyms[65 % 28] = anonyms[9]
    expect(rlv.anonym('A')).toBe('A stranger');
  });

  it('@showloc hides region and parcel names in incoming chat', () => {
    run('showloc=n');
    const out = rlv.filterIncomingChat({ fromId: BOB, fromName: 'Bob', text: 'Welcome to Sunny Cove in Ahern!', chatType: 1, sourceType: 1 }).text;
    expect(out).toBe('Welcome to (Hidden parcel) in (Hidden region)!');
  });

  it('name tags show only within @shownametags distance or for exceptions', () => {
    run('shownametags=n');
    expect(rlv.canShowNameTag(BOB, 1)).toBe(false); // the default distance is 0: nobody
    run('shownametags=y');
    run('shownametags:10=n');
    expect(rlv.canShowNameTag(BOB, 25)).toBe(true);
    expect(rlv.canShowNameTag(BOB, 400)).toBe(false);
    run(`shownametags:${BOB}=n`);
    expect(rlv.canShowNameTag(BOB, 400)).toBe(true);
  });
});

describe('notify', () => {
  it('parses <channel>[;<filter>] and rejects bad channels', () => {
    expect(run('notify:2222;tplm=n')).toBe(RlvRet.SUCCESS);
    expect(rlv.getNotifications()).toEqual([{ objectId: OBJ, channel: 2222, filter: 'tplm' }]);
    expect(run('notify:0=n')).toBe(RlvRet.FAILED_OPTION);
    expect(run('notify=n')).toBe(RlvRet.FAILED_OPTION);
    rlv.notify('tplm=n');
    rlv.notify('fly=n');
    expect(sent).toEqual([{ text: '/tplm=n', channel: 2222, type: CHAT_TYPE.SHOUT }]);
    run('notify:2222;tplm=y');
    expect(rlv.getNotifications()).toEqual([]);
  });
});

describe('outfit and inventory commands', () => {
  it('are accepted as restrictions but their force forms are reported as unsupported', () => {
    expect(run('remoutfit=n')).toBe(RlvRet.SUCCESS);
    expect(rlv.hasBehaviour('remoutfit')).toBe(true);
    expect(run('remoutfit:shirt=force')).toBe(RlvRet.FAILED_UNSUPPORTED);
    expect(run('attach:Folder=force')).toBe(RlvRet.FAILED_UNSUPPORTED);
  });
});
