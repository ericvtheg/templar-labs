precision highp float;
uniform vec2 resolution;
uniform float time, progress, bass, mid, high, level, kick, snare, drop, build, drive, beat;
uniform float profile, titleReveal, titleScatter, titleTravel;
uniform float scene, intensity, motion, grain, flash, loaded;
uniform vec3 primary, secondary, accent;
uniform sampler2D identity, footage;
uniform float hasFootage, footageAspect;
uniform float hasIdentity;
uniform float reachLeft, reachRight, grip, jawOpen, lunge, headTurn, bank, laserCue, laserPhase;
#define PI 3.14159265
#define TAU 6.28318531

float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
mat2 rotate(float a) { return mat2(cos(a),-sin(a),sin(a),cos(a)); }
float box(vec3 p, vec3 b) {
  vec3 q = abs(p)-b;
  return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.);
}
float armor(vec3 p, vec3 b, float r) { return box(p,b)-r; }
float capsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 ab=b-a;
  return length(p-a-ab*clamp(dot(p-a,ab)/dot(ab,ab),0.,1.))-r;
}
float tapered(vec3 p, vec3 a, vec3 b, float r1, float r2) {
  vec3 ab=b-a;
  float h=clamp(dot(p-a,ab)/dot(ab,ab),0.,1.);
  return length(p-a-ab*h)-mix(r1,r2,h);
}
vec2 nearest(vec2 a, vec2 b) { return a.x < b.x ? a : b; }
float stroke(float d, float width) {
  return exp(-abs(d)/width)+.14*exp(-abs(d)/(width*7.));
}
float punch() { return kick*(.25+intensity*.75); }

// Material IDs: titanium, dark recesses, primary emitters, secondary emitters, ivory.
vec2 sentinel(vec3 p) {
  float hit = punch();
  p.yz=rotate(lunge*.06)*p.yz;
  p.xz=rotate(headTurn*.18)*p.xz;
  vec3 head=p-vec3(0.,.40,.12+lunge*.14);
  head.xz=rotate(headTurn)*head.xz;
  head.yz=rotate(-.06-jawOpen*.1)*head.yz;
  vec3 mirror=head; mirror.x=abs(mirror.x);
  vec2 d=vec2(armor(head,vec3(.38,.39,.30),.045),1.);
  // Recessed visor cut through a bevelled helmet; luminous eyes sit inside it.
  d.x=max(d.x,(abs(head.x)*.62-head.y*.4+head.z*.5-.44));
  d.x=max(d.x,head.y+head.z*.35-.48);
  float socket=armor(head-vec3(0.,.025,.36),vec3(.43,.095,.12),.025);
  d.x=max(d.x,-socket);
  vec3 brow=mirror-vec3(.23,.22,.38); brow.xy=rotate(-.23)*brow.xy;
  d=nearest(d,vec2(armor(brow,vec3(.25,.045,.08),.012),1.));
  vec3 eye=mirror-vec3(.235,.027,.30); eye.xy=rotate(.12)*eye.xy;
  d=nearest(d,vec2(armor(eye,vec3(.145,.027,.025),.012),3.));
  d=nearest(d,vec2(armor(head-vec3(0.,.35,.36),vec3(.05,.14,.045),.015),2.));
  d=nearest(d,vec2(armor(head-vec3(0.,.40,.41),vec3(.012,.12,.012),.004),4.));
  // Cheek plates, face vents, and an articulated lower jaw.
  vec3 cheek=mirror-vec3(.36,-.20,.39); cheek.xy=rotate(.30)*cheek.xy;
  d=nearest(d,vec2(armor(cheek,vec3(.095,.18,.08),.02),1.));
  vec3 jaw=head-vec3(0.,-.36-jawOpen*.07-snare*.025,.31);
  jaw.yz=rotate(jawOpen*.20)*jaw.yz;
  d=nearest(d,vec2(armor(jaw,vec3(.26,.075,.14),.018),1.));
  vec3 vent=jaw; vent.x=mod(vent.x+.04,.08)-.04;
  float vents=box(vent-vec3(0.,.015,.20),vec3(.018,.06,.03));
  d=nearest(d,vec2(max(vents,box(jaw,vec3(.26,.12,.25))),2.));
  d=nearest(d,vec2(capsule(mirror,vec3(.49,-.06,.02),vec3(.58,.36,-.02),.10),2.));
  d=nearest(d,vec2(armor(mirror-vec3(.57,.30,.04),vec3(.025,.14,.07),.015),4.));
  // Neck pistons and chest reactor give the figure a human-readable silhouette.
  d=nearest(d,vec2(capsule(p,vec3(0.,-.10,0.),vec3(0.,-.58,0.),.20),2.));
  vec3 chest=p-vec3(0.,-.77,-.02);
  d=nearest(d,vec2(armor(chest,vec3(.54,.33,.30),.055),1.));
  vec3 plate=chest; plate.x=abs(plate.x); plate-=vec3(.32,.09,.32);
  plate.xy=rotate(.30)*plate.xy;
  d=nearest(d,vec2(armor(plate,vec3(.29,.085,.05),.025),1.));
  float reactor=length(chest-vec3(0.,0.,.37));
  d=nearest(d,vec2(reactor-.16,2.));
  d=nearest(d,vec2(length(chest-vec3(0.,0.,.48))-.10,3.));
  // Independent shoulder, elbow, wrist and finger motion reaches beyond the screen frame.
  vec3 arm=p; arm.x=abs(arm.x);
  float reach=p.x<0.?reachLeft:reachRight;
  vec3 shoulder=vec3(.83,-.45,-.02);
  vec3 elbow=vec3(1.12-reach*.22,-.92+reach*.18,.03+reach*.8);
  vec3 wrist=vec3(1.03-reach*.32,-.95+reach*.76,.25+reach*1.65);
  d=nearest(d,vec2(armor(arm-shoulder,vec3(.21,.19,.24),.035),1.));
  d=nearest(d,vec2(capsule(arm,shoulder,elbow,.15),2.));
  d=nearest(d,vec2(capsule(arm,elbow,wrist,.19),1.));
  d=nearest(d,vec2(length(arm-elbow)-.22,2.));
  d=nearest(d,vec2(armor(arm-wrist,vec3(.17,.12,.18),.05),1.));
  for(int i=0;i<3;i++) {
    float fi=float(i);
    vec3 knuckle=wrist+vec3((fi-1.)*.13,.08,.12);
    vec3 tip=knuckle+vec3((fi-1.)*.045,.25-grip*.13,.18+grip*.11);
    vec3 end=tip+vec3(0.,-.04-grip*.25,.19-grip*.16);
    d=nearest(d,vec2(capsule(arm,knuckle,tip,.043),1.));
    d=nearest(d,vec2(tapered(arm,tip,end,.041,.008),1.));
  }
  // Segmented abdominal armor, shoulder fins, and exposed hydraulic struts.
  for(int i=0;i<3;i++) {
    float fi=float(i);
    vec3 rib=p-vec3(0.,-1.15-fi*.16,0.);
    d=nearest(d,vec2(armor(rib,vec3(.37-fi*.065,.045,.25),.02),1.));
    vec3 fin=arm-shoulder-vec3(.13+fi*.07,.24+fi*.065,-.04);
    fin.xy=rotate(-.36)*fin.xy;
    d=nearest(d,vec2(armor(fin,vec3(.03,.15,.18),.009),1.));
  }
  d=nearest(d,vec2(capsule(arm,elbow+vec3(.17,0.,0.),wrist+vec3(.17,0.,0.),.035),5.));
  return d;
}

vec2 ravager(vec3 p) {
  float hit=punch();
  p.y+=.12-lunge*.08;
  p.xz=rotate(headTurn*.95)*p.xz;
  p.z-=lunge*.80;
  p.yz=rotate(-.1+headTurn*.2-lunge*.22)*p.yz;
  vec3 q=p; q.x=abs(q.x);
  // An armored animal skull with hollow sockets, horns, a muzzle, and opening fangs.
  vec3 skull=p-vec3(0.,.25,0.);
  float skullShape=(length(skull/vec3(.65,.60,.50))-1.)*.46;
  skullShape=max(skullShape,abs(skull.x)*.70+skull.z*.6-.57);
  skullShape=max(skullShape,skull.y*.7+skull.z*.4-.45);
  vec2 d=vec2(skullShape,1.);
  vec3 eye=q-vec3(.34,.27,.39); eye.xy=rotate(-.32)*eye.xy;
  d.x=max(d.x,-armor(eye,vec3(.20,.105,.19),.04));
  d=nearest(d,vec2(armor(eye-vec3(0.,0.,-.08),vec3(.13,.032,.025),.014),4.));
  vec3 brow=q-vec3(.36,.46,.36); brow.xy=rotate(.3)*brow.xy;
  d=nearest(d,vec2(armor(brow,vec3(.26,.055,.11),.013),1.));
  vec3 muzzle=p-vec3(0.,-.05,.44);
  float snout=armor(muzzle,vec3(.24,.13,.33),.025);
  snout=max(snout,abs(muzzle.x)+muzzle.z*.30-.27);
  snout=max(snout,muzzle.y+muzzle.z*.20-.15);
  d=nearest(d,vec2(snout,1.));
  vec3 nostril=q-vec3(.12,-.03,.74);
  d=nearest(d,vec2(armor(nostril,vec3(.042,.058,.012),.012),2.));
  // Curved horn segments are actual geometry, catching the moving rim lights.
  d=nearest(d,vec2(tapered(q,vec3(.5,.52,-.08),vec3(.84,.79,-.20),.18,.12),1.));
  d=nearest(d,vec2(tapered(q,vec3(.84,.79,-.20),vec3(.95,1.17,-.14),.12,.06),1.));
  d=nearest(d,vec2(tapered(q,vec3(.95,1.17,-.14),vec3(.74,1.43,.12),.06,.002),5.));
  d=nearest(d,vec2(tapered(q,vec3(.56,.06,.0),vec3(.90,-.28,-.12),.15,.06),1.));
  d=nearest(d,vec2(tapered(q,vec3(.90,-.28,-.12),vec3(.77,-.52,.26),.065,.002),5.));
  float opening=.04+jawOpen*.64+snare*.025;
  vec3 jaw=p-vec3(0.,-.37-opening,.27); jaw.yz=rotate(opening*.4)*jaw.yz;
  d=nearest(d,vec2(armor(jaw,vec3(.28,.075,.30),.025),1.));
  for(int i=0;i<3;i++) {
    float x=.085+float(i)*.1;
    float fang=.16+float(i)*.04;
    d=nearest(d,vec2(tapered(q,vec3(x,-.17,.59),vec3(x*.85,-.17-fang,.60),.042,.003),5.));
    vec3 tooth=jaw; tooth.x=abs(tooth.x);
    d=nearest(d,vec2(tapered(tooth,vec3(x,.1,.25),vec3(x,.22,.25),.029,.002),5.));
  }
  d=nearest(d,vec2(capsule(p,vec3(0.,-.48,-.15),vec3(0.,-1.25,-.35),.30),2.));
  for(int i=0;i<3;i++) {
    float fi=float(i);
    vec3 spine=p-vec3(0.,-.70-fi*.23,-.2);
    d=nearest(d,vec2(armor(spine,vec3(.45-fi*.08,.035,.28),.045),1.));
    d=nearest(d,vec2(armor(spine-vec3(0.,0.,.29),vec3(.19,.012,.025),.008),3.));
  }
  return d;
}

vec2 dreadnought(vec3 p) {
  p.x+=bank*.48;
  p.y-=lunge*.25;
  p.xy=rotate(bank*.9)*p.xy;
  p.yz=rotate(-.28+lunge*.12)*p.yz;
  p.xz=rotate(headTurn*.65)*p.xz;
  p.z-=lunge*.8;
  vec3 q=p; q.x=abs(q.x);
  vec2 d=vec2(armor(p,vec3(.23,.16,1.05),.09),1.);
  // Swept armored wings, raised command bridge, and twin engine nacelles.
  vec3 wing=q-vec3(.76,-.07,-.15); wing.xz=rotate(.30)*wing.xz;
  d=nearest(d,vec2(armor(wing,vec3(.70,.055,.43),.045),1.));
  d=nearest(d,vec2(armor(p-vec3(0.,.25,-.36),vec3(.20,.14,.32),.025),1.));
  d=nearest(d,vec2(armor(p-vec3(0.,.29,-.01),vec3(.16,.035,.02),.008),3.));
  d=nearest(d,vec2(armor(q-vec3(.96,-.01,-.2),vec3(.15,.17,.68),.06),2.));
  d=nearest(d,vec2(armor(q-vec3(.96,-.01,.50),vec3(.11,.105,.035),.025),4.));
  d=nearest(d,vec2(armor(q-vec3(.96,-.01,.56),vec3(.055,.055,.07+punch()*.25),.02),3.));
  // Rows of forward rail cannons, with recoil synchronized to the kick.
  for(int i=0;i<3;i++) {
    float fi=float(i);
    vec3 gun=q-vec3(.40+fi*.22,.05,.26-fi*.09-punch()*.16);
    d=nearest(d,vec2(armor(gun,vec3(.037,.07,.36),.015),1.));
    d=nearest(d,vec2(armor(gun-vec3(0.,0.,.37),vec3(.023,.04,.025),.006),4.));
  }
  return d;
}


vec3 cubeSpace(vec3 p) {
  p.xz=rotate(time*.18*motion+bank*.7)*p.xz;
  p.xy=rotate(.35+headTurn*.3)*p.xy;
  return p;
}
vec2 construct(vec3 p) {
  vec3 q=cubeSpace(p);
  float expand=scene>.5?max(0.,lunge)*.50:0.;
  if(scene<1.5) {
    vec3 cell=abs(q)-vec3(.45+expand);
    float shell=armor(cell,vec3(.40),.016);
    return vec2(shell,6.);
  }
  vec3 cell=mod(q+.27,.54)-.27;
  float cubes=armor(cell,vec3(.19+kick*.025),.008);
  return vec2(max(cubes,box(q,vec3(.99))),6.);
}
vec2 hologram(vec3 p) {
  p.xz=rotate(headTurn*.35)*p.xz;
  if(scene<.5) {
    // A bell-shaped lifeform contracts before its tentacles follow through.
    p.y-=.12;
    float breathing=1.-lunge*.12;
    vec3 dome=p-vec3(0.,.37,0.);
    float bell=(length(dome/vec3(.77*breathing,.45,.77*breathing))-1.)*.40;
    bell=max(bell,-dome.y-.12);
    vec2 d=vec2(bell,7.);
    float rim=length(vec2(length(dome.xz)-.70*breathing,dome.y+.10))-.025;
    d=nearest(d,vec2(rim,3.));
    for(int i=0;i<8;i++) {
      float a=float(i)*TAU/8.;
      vec3 tentacle=p;
      tentacle.xz=rotate(a)*tentacle.xz;
      float travel=clamp((.25-p.y)/1.65,0.,1.);
      tentacle.x-=.51+sin(travel*5.-laserPhase*TAU)*.14*travel+lunge*.18*travel;
      tentacle.z-=cos(travel*4.-laserPhase*TAU)*.12*travel;
      d=nearest(d,vec2(tapered(tentacle,vec3(0.,.25,0.),vec3(0.,-1.25,0.),.040,.005),7.));
    }
    return d;
  }
  if(scene<1.5) {
    vec2 d=vec2(length(p)-.31,7.);
    for(int i=0;i<4;i++) {
      float fi=float(i);
      vec3 q=p;
      q.xy=rotate(fi*.63+laserPhase*TAU*.25)*q.xy;
      q.yz=rotate(fi*.72+bank)*q.yz;
      float ring=length(vec2(length(q.xy)-(.55+fi*.17),q.z))-.023;
      d=nearest(d,vec2(ring,3.));
    }
    return d;
  }
  vec3 q=p;
  q.xz=rotate(laserPhase*.5)*q.xz;
  vec3 cell=q; cell.xz=mod(cell.xz+.32,.64)-.32;
  float columns=armor(cell,vec3(.11,1.25,.11),.01);
  float hall=max(columns,box(q,vec3(1.1,1.30,1.1)));
  float lintel=box(q-vec3(0.,1.19,0.),vec3(1.2,.06,1.2));
  return vec2(min(hall,lintel),7.);
}
vec3 abstractShow(vec2 p) {
  float t=time*(.4+motion*1.8);
  float hit=punch();
  vec3 col=primary*.004;
  p/=1.+hit*.15;
  if(scene<.5) {
    for(int i=0;i<8;i++) {
      float fi=float(i);
      vec2 q=rotate(t*.15+fi*.19+bank)*p;
      float shape=max(abs(q.x),abs(q.y))-(.07+fi*.045+hit*.03);
      col+=mix(primary,secondary,fi/7.)*stroke(shape,.0015)*(.35+hit);
    }
    col+=primary*exp(-length(p)*12.)*hit*.35;
  } else if(scene<1.5) {
    vec2 q=rotate(t*.12+bank)*p;
    float radius=max(length(q),.018);
    float depth=-log(radius)*2.;
    float angle=atan(q.y,q.x);
    float gate=abs(fract(depth-drive*1.5)-.5);
    float ribs=abs(sin(angle*6.));
    col+=mix(primary,secondary,.5+.5*sin(depth))*stroke(gate,.014)*(.4+hit*1.4);
    col+=primary*stroke(ribs,.01)*(.15+bass*.3);
    col*=smoothstep(.018,.055,radius);
  } else {
    vec2 q=rotate(t*.13+bank)*p;
    float r=length(q), a=atan(q.y,q.x);
    float folded=abs(mod(a+PI/6.,TAU/6.)-PI/6.);
    vec2 shard=vec2(cos(folded),sin(folded))*r;
    for(int i=0;i<7;i++) {
      float fi=float(i);
      float blade=shard.y+shard.x*.36-(.07+fi*.065+bass*.035);
      col+=mix(primary,secondary,fi/6.)*stroke(blade,.002)*(.4+hit);
    }
  }
  return col;
}

vec2 world(vec3 p) {
  if(profile>2.5) return construct(p);
  if(profile>1.5) return hologram(p);
  if(scene<.5) return sentinel(p);
  if(scene<1.5) return ravager(p);
  return dreadnought(p);
}
vec3 normalAt(vec3 p, float eps) {
  vec2 e=vec2(eps,-eps);
  return normalize(e.xyy*world(p+e.xyy).x+e.yyx*world(p+e.yyx).x+
    e.yxy*world(p+e.yxy).x+e.xxx*world(p+e.xxx).x);
}
float lettering(vec2 uv) {
  if(abs(uv.x)>.5 || abs(uv.y)>.5) return 0.;
  return texture2D(identity,uv+vec2(.5)).a*hasIdentity;
}

void main() {
  vec2 uv=(gl_FragCoord.xy-resolution*.5)/resolution.y;
  float aspect=resolution.x/resolution.y;
  float hit=punch();
  float activity=mix(.85,clamp(level*1.5+kick*.3,0.,1.),loaded);
  float t=time*(.35+motion*.65);
  float shot=mod(floor(beat/8.),3.);
  float yaw=sin(t*.3)*.12*motion+(shot-1.)*.30*motion;
  float cameraDistance=5.7-mod(shot,2.)*.8*motion;
  if(profile>1.5) cameraDistance=5.4;

  if(profile>1.5 && profile<2.5) yaw=sin(t*.13)*.3*motion;
  float cameraPunch=hit*(profile>1.5 && profile<2.5?.15:.75);
  vec3 ro=vec3(sin(yaw)*(cameraDistance-cameraPunch),.12+sin(t*.2)*.13*motion,cos(yaw)*(cameraDistance-cameraPunch-drop*.9));
  ro.z+=max(0.,1.25-aspect)*2.;
  vec3 target=vec3(0.,scene>1.5?-.05:.04,0.);
  vec3 forward=normalize(target-ro);
  vec3 right=normalize(cross(forward,vec3(0.,1.,0.)));
  vec3 up=cross(right,forward);
  vec2 lens=uv+vec2(hash(beat)-.5,hash(beat+72.)-.5)*hit*.012*motion;
  vec3 rd=normalize(right*lens.x+up*lens.y+forward*1.65);
  vec3 col=primary*.018+secondary*.006;
  // The hangar/cathedral lives behind the subject, with perspective ribs and haze.
  vec2 back=uv; back.x+=yaw*.25;
  float opening=length(back*vec2(1.,.85));
  col+=primary*exp(-opening*3.)*(.09+activity*.16);
  float arch=abs(max(abs(back.x)*.82,abs(back.y+.02))-.37);
  col+=secondary*stroke(arch,.003)*(.13+high*.2);
  for(int i=0;i<8;i++) {
    float fi=float(i);
    float scale=.48+fi*.11;
    float rib=abs(max(abs(back.x)*.74,abs(back.y+.07)) - scale);
    col+=mix(primary,secondary,fi/8.)*stroke(rib,.0015)*(.15+hit*.5)/(1.+fi*.3);
  }
  // Floor reflection, racing runway markers, and architectural columns.
  if(rd.y<-.015) {
    float travel=(-1.38-ro.y)/rd.y;
    vec3 ground=ro+rd*travel;
    vec2 tile=abs(fract(ground.xz*.65)-.5);
    float grid=stroke(min(tile.x,tile.y),.006);
    float fog=exp(-travel*.11);
    col+=primary*grid*fog*.11;
    col+=secondary*exp(-abs(ground.x)*2.)*fog*(.06+hit*.25);
    float runway=stroke(abs(ground.x)-1.8,.025)*step(.4,fract(ground.z*.6+drive*.15));
    col+=accent*runway*fog*(.20+kick*.4);
  }
  for(int i=0;i<10;i++) {
    float fi=float(i);
    float x=(fi-4.5)*.185;
    float height=.05+hash(fi+scene*20.)*.23;
    vec2 building=back-vec2(x,-.34+height*.5);
    float silhouette=max(abs(building.x)-.035,abs(building.y)-height*.5);
    float bmask=1.-smoothstep(0.,.003,silhouette);
    col=mix(col,col*.18,bmask);
    float windows=step(.72,fract(building.y*110.))*step(.5,fract(building.x*190.));
    col+=primary*windows*bmask*.13;
    col+=secondary*stroke(silhouette,.0009)*.15;
  }
  if(profile>.5 && profile<1.5) col=abstractShow(uv);
  // Perspective-projected type travels through the stage behind the subject.
  float titleDepth=-1.5-titleTravel*2.5;
  float titleRay=(titleDepth-ro.z)/rd.z;
  vec3 titlePoint=ro+rd*titleRay;
  float titleWidth=max(aspect*3.7,2.4);
  vec2 title=vec2(titlePoint.x/titleWidth,(titlePoint.y-.90-titleTravel*.35)/.82);
  float band=floor((title.y+.5)*10.);
  title.x+=(hash(band+floor(beat/8.))-.5)*titleScatter*.9;
  float frontIdentity=profile<.5?smoothstep(.2,.35,laserPhase):(profile<1.5?1.:0.);
  float backIdentity=profile<.5?1.-frontIdentity:(profile>1.5 && profile<2.5?1.:0.);
  float name=lettering(title)*titleReveal*backIdentity;
  col+=mix(primary,accent,.5)*name*(.45+hit*.8+drop*.7);
  // A false screen border: geometry is composited in front of its top and side rails.
  float border=stroke(abs(uv.x)-aspect*.445,.0013)*step(abs(uv.y),.435);
  border+=stroke(abs(uv.y)-.435,.0013)*step(abs(uv.x),aspect*.445);
  col+=primary*border*(.18+hit*.25);
  float corners=step(aspect*.35,abs(uv.x))+step(.35,abs(uv.y));
  col+=accent*border*corners*.14;

  // March only the finite volume occupied by the animated hero.
  vec3 inv=1./rd;
  vec3 bounds=vec3(2.1,1.85,2.8);
  vec3 nearV=(-bounds-ro)*inv, farV=(bounds-ro)*inv;
  vec3 mn=min(nearV,farV), mx=max(nearV,farV);
  float nearT=max(max(mn.x,mn.y),mn.z);
  float farT=min(min(mx.x,mx.y),mx.z);
  float distance=max(nearT,0.);
  vec2 surface=vec2(1.,0.);
  bool found=false;
  if(farT>distance && hasFootage<.5 && (profile<.5 || profile>1.5)) {
    for(int i=0;i<60;i++) {
      vec3 p=ro+rd*distance;
      surface=world(p);
      if(surface.x<.0025) { found=true; break; }
      distance+=surface.x*.85;
      if(distance>farT) break;
    }
  }
  if(found) {
    vec3 p=ro+rd*distance;
    vec3 n=normalAt(p,.003);
    vec3 view=-rd;
    vec3 l1=normalize(vec3(-2.5,3.2,3.));
    vec3 l2=normalize(vec3(2.8,.8,1.));
    vec3 l3=normalize(vec3(.2,2.,-3.));
    float diffuse=max(dot(n,l1),0.);
    float rim=pow(1.-max(dot(n,view),0.),3.);
    float spec=pow(max(dot(n,normalize(l1+view)),0.),55.);
    float spec2=pow(max(dot(n,normalize(l2+view)),0.),38.);
    float ao=clamp(world(p+n*.10).x/.10,.2,1.);
    float material=surface.y;
    float shadow=1.;
    float shadowT=.025;
    for(int j=0;j<10;j++) {
      float obstruction=world(p+n*.012+l1*shadowT).x;
      shadow=min(shadow,12.*max(obstruction,0.)/shadowT);
      shadowT+=clamp(obstruction,.035,.20);
    }
    vec3 metal=vec3(.12,.15,.18);
    // Engraved seams and machined surface variation give the armor scale.
    float seam=step(.97,fract(p.y*8.))+step(.982,fract(p.x*11.+floor(p.y*8.)*.27));
    metal*=1.-seam*.30;
    metal*=.97+.03*sin(p.y*145.+p.z*43.);
    if(material>1.5 && material<2.5) metal=vec3(.022,.030,.042);
    if(material>4.5) metal=vec3(.58,.62,.59);
    vec3 lit=metal*(accent*(.07+diffuse*shadow*1.1)+primary*max(dot(n,l2),0.)*.32)*ao;
    lit+=accent*spec*shadow*1.8+secondary*spec2*1.2;
    lit+=secondary*(rim*.22+pow(max(dot(n,l3),0.),3.)*.20);
    lit+=primary*max(n.y,0.)*.075;
    float ignition=.35+activity*.4+hit*2.+drop*1.6;
    if(material>2.5 && material<3.5) lit=primary*ignition*2.;
    if(material>3.5 && material<4.5) lit=secondary*ignition*2.;
    // Beat-scanned light travels over the surface without replacing its shading.
    float scan=exp(-abs(p.y-(.9-snare*2.2))*38.)*snare;
    lit+=accent*scan*.7;
    // Intro emerges from silhouette; builds dim the body before the drop reveals it.
    float reveal=mix(1.,smoothstep(.01,.12,progress),loaded);
    float exposure=(.25+reveal*.75)*(1.-build*.45)+hit*.4+drop*.6;
    if(material>5.5 && material<6.5) {
      vec3 q=cubeSpace(p);
      vec3 face=abs(cubeSpace(n));
      vec2 ledUV=face.z>max(face.x,face.y)?q.xy:(face.x>face.y?q.zy:q.xz);
      vec2 led=abs(fract(ledUV*43.)-.5);
      float dots=(1.-smoothstep(.24,.46,length(led)));
      float pattern=.5+.5*sin(ledUV.y*16.+laserPhase*TAU*2.+sin(ledUV.x*9.)*2.);
      float sweep=step(.5,fract(ledUV.x*3.+laserPhase*2.));
      vec3 panel=mix(primary,secondary,pattern)*(.12+pattern*.7+sweep*hit);
      vec2 cubeTitle=vec2(ledUV.x/1.6,ledUV.y*4.);
      panel+=accent*lettering(cubeTitle)*titleReveal*3.;
      lit=panel*dots+accent*spec*.4;
    }
    if(material>6.5) {
      float scan=.25+.75*pow(.5+.5*sin(p.y*170.),2.);
      float veins=pow(.5+.5*sin(atan(p.z,p.x)*16.+p.y*8.),8.);
      lit=(primary*(rim*1.6+.14)+secondary*veins*.35)*scan;
      lit+=accent*spec*.35;
      if(profile>1.5 && profile<2.5) col*=.45;
    }
    col=material>6.5?col+lit:lit*(.35+activity*.65)*exposure;
  }
  if(hasFootage>.5) {
    // Center-crop footage for each output format; preserve its authored animation.
    vec2 videoUV=gl_FragCoord.xy/resolution-.5;
    if(aspect>footageAspect) videoUV.y*=footageAspect/aspect;
    else videoUV.x*=aspect/footageAspect;
    vec3 film=texture2D(footage,videoUV+.5).rgb;
    col=pow(max(film,vec3(.001)),vec3(1.15))*.95;
  }
  // Moving-head banks in world space. The ray/beam closest approach produces a
  // finite cone in haze; the camera ray ends at the hero, so rear beams occlude.
  float visibility=found?distance:18.;
  for(int i=0;i<24;i++) {
    float fi=float(i);
    float side=mod(fi,2.)*2.-1.;
    float fixture=floor(fi/6.);
    float fan=mod(floor(fi/2.),3.)-1.;
    vec3 origin=vec3(side*(2.1+fixture*.27),-1.35,-1.4-fixture*.35);
    float pan=sin(laserPhase*TAU+fixture*.5)*.7*motion;
    vec3 direction=normalize(vec3(-side*(.5+fan*.23)+pan,1.1, .3+fan*.3));
    if(laserCue>.5 && laserCue<1.5) {
      direction=normalize(vec3(-side*(.7+fan*.11),.35+laserPhase*1.3,1.2));
    } else if(laserCue>1.5 && laserCue<2.5) {
      direction=normalize(vec3(-side*.7+fan*.18,1.,-.5+laserPhase*1.8));
    } else if(laserCue>2.5) {
      direction=normalize(vec3(sin(laserPhase*TAU+fi*.24)*.8,1.,cos(laserPhase*TAU+fi*.24)*.8));
    }
    float profileDimmer=1.;
    if(profile>1.5 && profile<2.5) {
      direction=normalize(vec3(-side*.08+fan*.07,.9, .1+laserPhase*.4));
      profileDimmer=mod(fi,3.)<.5?.55:0.;
    } else if(profile>2.5) {
      direction=normalize(vec3(-side*.65, .6+floor(laserPhase*4.)*.24, fan*.20));
      profileDimmer=.2+.8*step(.4,fract(fi*.21-laserPhase*4.));
    }
    vec3 w=ro-origin;
    float parallel=dot(rd,direction);
    float cameraProjection=dot(rd,w), beamProjection=dot(direction,w);
    float beamT=clamp((beamProjection-parallel*cameraProjection)/max(1.-parallel*parallel,.001),0.,12.);
    float rayT=clamp(dot(origin+direction*beamT-ro,rd),0.,visibility);
    float separation=length(ro+rd*rayT-origin-direction*beamT);
    float radius=.007+beamT*.006;
    float core=exp(-separation*separation/(radius*radius));
    float haze=exp(-separation*separation/(radius*radius*12.))*.12;
    float dimmer=(.20+hit*1.1+high*.25+drop*.55)*profileDimmer;
    float chase=laserCue>2.5?(.25+.75*step(.4,fract(fi*.17-laserPhase*2.))):1.;
    vec3 lightColor=mix(primary,secondary,mod(fixture,2.));
    col+=lightColor*(core+haze)*dimmer*chase/(1.+beamT*.06);
    // The emitter is a small, bright point at the fixture, not a floating 2D line.
    float sourceT=clamp(dot(origin-ro,rd),0.,visibility);
    float sourceDistance=length(ro+rd*sourceT-origin);
    col+=accent*exp(-sourceDistance*90.)*dimmer;
  }
  // Sparks move through depth on the audio clock.
  for(int i=0;i<20;i++) {
    float fi=float(i);
    vec2 spark=vec2((hash(fi)-.5)*aspect,fract(hash(fi+40.)+drive*.025)-.5);
    vec2 delta=uv-spark;
    col+=accent*exp(-abs(delta.x)*1500.-abs(delta.y)*180.)*(.12+high*.65);
  }
  // The artist has a cue, not a permanent caption: assemble, strike, hold, split.
  float finale=smoothstep(.88,.95,progress)*loaded;
  float visibilityTitle=max(titleReveal*frontIdentity,finale);
  float scatter=titleScatter*(1.-finale);
  vec2 lockup=uv;
  float centerY=profile<.5?-.22:(profile<1.5?0.:.27);
  centerY=mix(centerY,0.,finale);
  lockup.y-=centerY;
  lockup.y+=titleTravel*.10*(1.-finale);
  lockup/=1.+max(0.,lunge)*.10;
  lockup=vec2(lockup.x/max(aspect*.84,.42),lockup.y*6.8);
  float slice=floor((lockup.y+.5)*12.);
  float offset=(hash(slice+floor(beat/8.))-.5)*scatter*.85;
  if(profile>2.5) offset=floor(offset*10.)*.1;
  lockup.x+=offset;
  float wipe=step(lockup.x+.5,titleReveal*1.25+finale);
  float titleMask=lettering(lockup)*visibilityTitle*wipe;
  // A shallow extrusion and chromatic edge separate the type from the lighting.
  float extrusion=lettering(lockup+vec2(.007,-.025))*visibilityTitle*wipe;
  col*=1.-extrusion*.85;
  col+=secondary*extrusion*.28;
  col+=mix(accent,primary,.12)*titleMask*(.9+hit*.7);
  // Short shock fronts preserve the drum's sharp attack, without covering the hero.
  float shock=length(uv*vec2(1.,1.2))-(.18+(1.-kick)*.75);
  col+=primary*stroke(shock,.003)*hit*.55;
  col+=flash*accent*(snare*.025+drop*.06)*activity;
  col=vec3(1.)-exp(-col*(1.15+intensity*.65));
  col*=1.-smoothstep(.45,1.15,length(uv))*.38;
  col+=(hash(dot(gl_FragCoord.xy,vec2(1.,117.))+floor(time*30.))-.5)*.015*grain;
  col*=mix(1.,smoothstep(0.,.002,progress)*(1.-smoothstep(.985,1.,progress)),loaded);
  gl_FragColor=vec4(max(col,0.),1.);
}
