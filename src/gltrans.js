// Shader transitions. Each one is a GLSL body `vec4 tr(vec2 u)` that mixes layer A (the outgoing clip,
// held on its last frame) and layer B (the incoming clip) at progress p (0..1). Both layers are full
// frames with alpha; sampling outside 0..1 mirrors, so zooms and pushes never show empty edges.
// The preview runs them every frame; the export renders the same frames to PNGs (see app.js).
(function (root) {
  const HEAD = `precision highp float;
varying vec2 uv0;
uniform sampler2D tA, tB;
uniform float p;
uniform vec2 RR;
uniform float D;
vec2 R;
#define PI 3.14159265
float AS(){return R.x/R.y;}
vec2 mir(vec2 u){vec2 m=mod(u,2.);return mix(m,2.-m,step(1.,m));}
// D turns the whole transition: the shader works in turned space, pictures are read back through dinv
vec2 dfwd(vec2 s){return D<.5?s:D<1.5?vec2(s.y,1.-s.x):D<2.5?1.-s:vec2(1.-s.y,s.x);}
vec2 dinv(vec2 u){return D<.5?u:D<1.5?vec2(1.-u.y,u.x):D<2.5?1.-u:vec2(u.y,1.-u.x);}
vec4 TA(vec2 u){return texture2D(tA,mir(dinv(u)));}
vec4 TB(vec2 u){return texture2D(tB,mir(dinv(u)));}
bool inb(vec2 u){return u.x>=0.&&u.x<=1.&&u.y>=0.&&u.y<=1.;}
float io(float x){return x<.5?4.*x*x*x:1.-pow(2.-2.*x,3.)*.5;}
float ei(float x){return x*x*x;}
float eo(float x){float y=1.-x;return 1.-y*y*y;}
float bk(float x){float c=1.70158;float y=x-1.;return 1.+(c+1.)*y*y*y+c*y*y;}
float h1(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);return mix(mix(h1(i),h1(i+vec2(1.,0.)),f.x),mix(h1(i+vec2(0.,1.)),h1(i+1.),f.x),f.y);}
float fbm(vec2 q){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*vn(q);q*=2.03;a*=.5;}return s;}
vec2 rot(vec2 q,float a){float c=cos(a),s=sin(a);return vec2(c*q.x-s*q.y,s*q.x+c*q.y);}
vec2 zm(vec2 u,vec2 c,float z){return c+(u-c)/z;}
vec2 rc(vec2 u,vec2 c,float a){vec2 k=vec2(AS(),1.);return rot((u-c)*k,a)/k+c;}
vec2 sq(vec2 u){return (u-.5)*vec2(AS(),1.);}
float jit(){return h1(gl_FragCoord.xy+fract(p*7.));}
vec4 zbA(vec2 u,float k){vec4 s=vec4(0.);float j=jit();for(int i=0;i<20;i++)s+=TA(.5+(u-.5)*(1.-k*(float(i)+j)/20.));return s/20.;}
vec4 zbB(vec2 u,float k){vec4 s=vec4(0.);float j=jit();for(int i=0;i<20;i++)s+=TB(.5+(u-.5)*(1.-k*(float(i)+j)/20.));return s/20.;}
vec4 dbA(vec2 u,vec2 d){vec4 s=vec4(0.);float j=jit();for(int i=0;i<20;i++)s+=TA(u+d*((float(i)+j)/20.-.5));return s/20.;}
vec4 dbB(vec2 u,vec2 d){vec4 s=vec4(0.);float j=jit();for(int i=0;i<20;i++)s+=TB(u+d*((float(i)+j)/20.-.5));return s/20.;}
vec4 sbA(vec2 u,float a){vec4 s=vec4(0.);float j=jit();for(int i=0;i<20;i++)s+=TA(rc(u,vec2(.5),a*((float(i)+j)/20.-.5)));return s/20.;}
vec4 sbB(vec2 u,float a){vec4 s=vec4(0.);float j=jit();for(int i=0;i<20;i++)s+=TB(rc(u,vec2(.5),a*((float(i)+j)/20.-.5)));return s/20.;}
vec2 spiral(int i,float r){float f=float(i)+.5;float a=f*2.39996+jit()*6.283;return vec2(cos(a),sin(a))*sqrt(f/24.)*r*vec2(1./AS(),1.);}
vec4 bA(vec2 u,float r){vec4 s=vec4(0.);for(int i=0;i<24;i++)s+=TA(u+spiral(i,r));return s/24.;}
vec4 bB(vec2 u,float r){vec4 s=vec4(0.);for(int i=0;i<24;i++)s+=TB(u+spiral(i,r));return s/24.;}
vec4 rgbA(vec2 u,vec2 d){vec4 g=TA(u);return vec4(TA(u+d).r,g.g,TA(u-d).b,g.a);}
vec4 rgbB(vec2 u,vec2 d){vec4 g=TB(u);return vec4(TB(u+d).r,g.g,TB(u-d).b,g.a);}
vec4 X(vec2 u,float w){return w<.5?TA(u):TB(u);}
vec4 mixAB(vec2 u,float w){return mix(TA(u),TB(u),w);}
vec2 bulge(vec2 u,float k){vec2 q=sq(u);float r=length(q);q*=1.+k*r*r;return q/vec2(AS(),1.)+.5;}
vec2 twirl(vec2 u,float a){vec2 q=sq(u);float r=length(q);q=rot(q,a*smoothstep(.95,0.,r));return q/vec2(AS(),1.)+.5;}
// a flat card (a frame-sized picture) hit by the ray through screen point u: xy = its own uv, z = depth (or -1)
vec3 card(vec2 u,vec3 Q,vec3 e1,vec3 e2){float f=2.4;vec3 C=vec3(0.,0.,-f);vec3 r=vec3((u-.5)*2.*vec2(AS(),1.),f);vec3 n=cross(e1,e2);
  float dn=dot(r,n);if(abs(dn)<1e-5)return vec3(0.,0.,-1.);float t=dot(Q-C,n)/dn;vec3 P=C+t*r-Q;
  vec2 l=vec2(dot(P,e1)/AS(),dot(P,e2))*.5+.5;return (t>0.&&inb(l))?vec3(l,t):vec3(l,-1.);}
vec3 ry(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(c*v.x+s*v.z,v.y,-s*v.x+c*v.z);}
vec3 rx(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(v.x,c*v.y-s*v.z,s*v.y+c*v.z);}
vec4 bg(vec2 u){return mix(bA(u,.06),bB(u,.06),smoothstep(.3,.7,p))*vec4(.35,.35,.35,1.);}
// wipe mask from a 0..1 field d: exactly 0 at p=0 and 1 at p=1, soft edge s
float wp(float d,float s){return smoothstep(0.,s,p*(1.+s)-clamp(d,0.,1.));}
float lu(vec4 c){return dot(c.rgb,vec3(.299,.587,.114));}
vec4 wpm(vec2 u,float d,float s){return mixAB(u,wp(d,s));}
`;
  // template helpers for families that only differ by a direction
  const whip = (dx, dy, rgb) => `vec4 tr(vec2 u){float e=io(p),b=pow(sin(PI*p),3.);vec2 D=vec2(${dx}.,${dy}.);vec2 o=D*e,d=D*b*.3;
  vec2 v=e<.5?u+o:u+o-D;${rgb ? 'vec2 s=D*b*.035;vec4 g=e<.5?dbA(v,d):dbB(v,d);return vec4((e<.5?dbA(v+s,d):dbB(v+s,d)).r,g.g,(e<.5?dbA(v-s,d):dbB(v-s,d)).b,g.a);' : 'return e<.5?dbA(v,d):dbB(v,d);'}}`;
  const stretch = (ax) => `vec4 tr(vec2 u){float b=sin(PI*p);vec2 D=vec2(${ax === 'x' ? '1.,0.' : '0.,1.'});
  if(p<.5){float t=ei(p*2.);vec2 v=u;v${'.' + ax}=.5+(v${'.' + ax}-.5)/(1.+9.*t);return dbA(v,D*.25*t);}
  float t=1.-eo(p*2.-1.);vec2 v=u;v${'.' + ax}=.5+(v${'.' + ax}-.5)/(1.+9.*t);return dbB(v,D*.25*t);}`;
  const pano = (dx) => `vec4 tr(vec2 u){float e=io(p),b=pow(sin(PI*p),2.);vec2 c=u-.5;c.x*=1.+b*1.6*c.y*c.y;c.y*=1.-b*.25*(1.-4.*c.x*c.x);
  vec2 v=c+.5+vec2(${dx}.*e,0.);vec2 d=vec2(${dx}.*b*.25,0.);return e<.5?dbA(v,d):dbB(v-vec2(${dx}.,0.),d);}`;
  const cubeH = (sg) => `vec4 tr(vec2 u){float a=${sg}.*io(p)*PI*.5,z=sin(PI*p)*1.2,h=AS();vec3 K=vec3(0.,0.,h+z);
  vec3 A=card(u,K+ry(vec3(0.,0.,-h),a),ry(vec3(1.,0.,0.),a),vec3(0.,1.,0.));
  vec3 B=card(u,K+ry(vec3(${sg}.*h,0.,0.),a),ry(vec3(0.,0.,${sg}.),a),vec3(0.,1.,0.));
  float la=.55+.45*abs(cos(a)),lb=.55+.45*abs(sin(a));
  if(A.z>0.&&(B.z<0.||A.z<B.z))return TA(A.xy)*vec4(la,la,la,1.);if(B.z>0.)return TB(B.xy)*vec4(lb,lb,lb,1.);return vec4(0.,0.,0.,1.);}`;
  const cubeV = (sg) => `vec4 tr(vec2 u){float a=${sg}.*io(p)*PI*.5,z=sin(PI*p)*1.2;vec3 K=vec3(0.,0.,1.+z);
  vec3 A=card(u,K+rx(vec3(0.,0.,-1.),a),vec3(1.,0.,0.),rx(vec3(0.,1.,0.),a));
  vec3 B=card(u,K+rx(vec3(0.,${-1 * sg}.,0.),a),vec3(1.,0.,0.),rx(vec3(0.,0.,${-1 * sg}.),a));
  float la=.55+.45*abs(cos(a)),lb=.55+.45*abs(sin(a));
  if(A.z>0.&&(B.z<0.||A.z<B.z))return TA(A.xy)*vec4(la,la,la,1.);if(B.z>0.)return TB(B.xy)*vec4(lb,lb,lb,1.);return vec4(0.,0.,0.,1.);}`;
  const flip = (ax) => `vec4 tr(vec2 u){float a=io(p)*PI,z=sin(PI*p)*1.5;vec3 Q=vec3(0.,0.,z);
  vec3 e1=${ax === 'y' ? 'ry(vec3(1.,0.,0.),a)' : 'vec3(1.,0.,0.)'},e2=${ax === 'y' ? 'vec3(0.,1.,0.)' : 'rx(vec3(0.,1.,0.),a)'};vec3 c=card(u,Q,e1,e2);
  if(c.z<0.)return bg(u)*.6;float l=.5+.5*abs(cos(a));vec2 v=c.xy;if(a>PI*.5)v${ax === 'y' ? '.x' : '.y'}=1.-v${ax === 'y' ? '.x' : '.y'};return (a<PI*.5?TA(v):TB(v))*vec4(l,l,l,1.);}`;
  const blinds = (ax, n) => `vec4 tr(vec2 u){float e=io(p);float f=fract(u.${ax}*${n}.);return f<e?TB(u):TA(u);}`;

  // film family helpers: screen blend, burn colour ramp, rounded box, and moving grain + dust at 24 fps
  const F = `vec3 scr(vec3 a,vec3 b){return 1.-(1.-a)*(1.-b);}
vec3 ramp(float i){return i<.5?mix(vec3(.45,.02,0.),vec3(1.,.35,.02),i*2.):mix(vec3(1.,.35,.02),vec3(1.,.97,.75),i*2.-1.);}
float rr(vec2 q,vec2 h,float r){vec2 d=abs(q)-h+r;return length(max(d,0.))+min(max(d.x,d.y),0.)-r;}
vec4 film(vec4 c,vec2 u,float k){float f=floor(p*24.);c.rgb+=(h1(floor(u*R*.5)+f*.37)-.5)*.12*k;
  c.rgb=mix(c.rgb,vec3(1.),step(.9985,h1(floor(u*R/3.)+f))*k);return c;}
`;
  // a fat painted brush stroke that zig-zags over the frame, then wipes back off to show the next clip
  const scrib = (col) => `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float q=p<.5?p*2.:2.-p*2.;vec2 s=sq(u);float n=vn(u*40.)*.5+fbm(u*6.)*.5;float M=0.;
  for(int i=0;i<4;i++){float fi=float(i);float t=clamp(q*4.-fi,0.,1.);float x=s.x*(mod(fi,2.)<.5?1.:-1.);
    float yl=-.62+fi*.42+x*.35+sin(x*6.+fi)*.05;float W=AS()*.5+.1;
    M=max(M,step(abs(s.y-yl)-.27+(n-.5)*.06,0.)*step(x,-W+2.*W*t+(n-.5)*.05));}
  M=max(M,step(.98,q));vec4 c=X(u,p);return film(vec4(mix(c.rgb,${col}*(.8+.35*n),M),1.),u,b*.5);}`;
  // seamless-pack helpers: elastic and bounce easing, rounded box, voronoi shards
  const G = `float el(float x){return 1.-pow(2.,-9.*x)*cos(x*PI*4.5);}
float bo(float x){if(x<1./2.75)return 7.5625*x*x;if(x<2./2.75){x-=1.5/2.75;return 7.5625*x*x+.75;}if(x<2.5/2.75){x-=2.25/2.75;return 7.5625*x*x+.9375;}x-=2.625/2.75;return 7.5625*x*x+.984375;}
float rr(vec2 q,vec2 h,float r){vec2 d=abs(q)-h+r;return length(max(d,0.))+min(max(d.x,d.y),0.)-r;}
vec2 cell(vec2 q){vec2 i=floor(q),f=fract(q);float md=9.;vec2 mc=vec2(0.);for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));
  vec2 o=vec2(h1(i+g),h1(i+g+9.));vec2 r=g+o-f;float d=dot(r,r);if(d<md){md=d;mc=i+g+o;}}return mc;}
`;
  // the next clip pushes in from the top on an elastic or bouncing ease
  const flatE = (ease) => G + `vec4 tr(vec2 u){float e=${ease}(p),b=max(sin(PI*min(p*1.6,1.)),0.);float y=u.y-(1.-e);vec2 d=vec2(0.,.15*b);
  return y>=0.?dbB(vec2(u.x,y),d):dbA(vec2(u.x,y+1.),d);}`;
  // perspective: both clips ride tilted cards sideways, receding (in) or coming close (out)
  const persp = (sg, z) => G + `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);float h=AS();float ang=${sg}.*.6*b;vec3 e1=ry(vec3(1.,0.,0.),ang),e2=vec3(0.,1.,0.);
  vec3 A=card(u,vec3(-e*2.2*h,0.,${z}*b),e1,e2),B=card(u,vec3((1.-e)*2.2*h,0.,${z}*b),e1,e2);
  if(A.z>0.)return dbA(A.xy,vec2(.08*b,0.));if(B.z>0.)return dbB(B.xy,vec2(.08*b,0.));return bg(u);}`;
  // stripes at angle a: alternate bands push the frame opposite ways, each band starting a little later
  const stripes = (a, n) => G + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 s=sq(u);vec2 d=vec2(cos(${a}),sin(${a}));float band=floor(dot(s,vec2(-d.y,d.x))*${n}.+100.);
  float t=clamp((p-.3*fract(band*.618))/.7,0.,1.),e=io(t),sg=mod(band,2.)<.5?1.:-1.,S=AS()*abs(d.x)+abs(d.y);
  vec2 ua=(s+d*sg*e*S)/vec2(AS(),1.)+.5,ub=(s+d*sg*(e-1.)*S)/vec2(AS(),1.)+.5;vec2 m=d/vec2(AS(),1.)*.12*sin(PI*t);
  return inb(ua)?dbA(ua,m):dbB(ub,m);}`;
  // colour-shape wipes: three flat coloured layers sweep over the cut one after another, then sweep off to show the next clip.
  // x is how far along the sweep each pixel sits (about 0..1); the expression gives each family its edge shape
  const shape = (xe, c0, c1, c2) => `float cv(float x,float a,float b){float w=1.5/R.y;return smoothstep(b-w,b+w,x)*(1.-smoothstep(a-w,a+w,x));}
float fr(float t){return -.35+1.7*io(clamp(t/.36,0.,1.));}
vec4 tr(vec2 u){vec2 s=sq(u);float x=${xe};
  float i0=fr(p),i1=fr(p-.07),i2=fr(p-.14),o2=fr(p-.5),o1=fr(p-.57),o0=fr(p-.64);
  vec4 c=x<i2?TB(u):TA(u);c.rgb=mix(c.rgb,${c0},cv(x,i0,o0));c.rgb=mix(c.rgb,${c1},cv(x,i1,o1));c.rgb=mix(c.rgb,${c2},cv(x,i2,o2));return c;}`;
  // pixel-experts helpers: hue rotation
  const PX = `vec3 hue(vec3 c,float a){vec3 k=vec3(.57735);float ca=cos(a);return c*ca+cross(k,c)*sin(a)+k*dot(k,c)*(1.-ca);}
`;
  const echo = (inv) => `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 s=vec4(0.);float W=0.;
  for(int i=0;i<6;i++){float k=float(i),w=pow(.6,k);s+=w*mixAB(zm(u,vec2(.5),1.+k*.06*b),smoothstep(.35,.65,p-k*.03*b));W+=w;}s/=W;
  ${inv ? 's.rgb=mix(s.rgb,1.-s.rgb,step(.3,p)*step(p,.75)*step(.5,h1(vec2(floor(p*12.),7.))));' : ''}return s;}`;
  const poster = (red) => `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=X(zm(u,vec2(.5),1.+.35*b),p);float L=mix(32.,3.,smoothstep(.1,.8,b));c.rgb=floor(c.rgb*L+.5)/L;
  ${red ? 'float on=step(.45,h1(vec2(floor(p*16.),3.)))*(1.-smoothstep(.05,.3,abs(p-.5)));c.rgb=mix(c.rgb,vec3(1.,.08,.06)*(.25+1.5*dot(c.rgb,vec3(.3,.59,.11))),on*.85);' : ''}return c;}`;
  // tech-nestology pack: zoom blur around any centre point
  const N = `vec4 zc(vec2 u,vec2 c,float k,bool b){vec4 s=vec4(0.);float j=jit();for(int i=0;i<16;i++){vec2 v=c+(u-c)*(1.-k*(float(i)+j)/16.);s+=b?TB(v):TA(v);}return s/16.;}
`;
  // the next clip moves in inside a growing shape while horizontal bands of both clips slide apart
  const dshape = (inside, k) => `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);vec2 s=sq(u);float sc=max(e*${k},.001);vec2 q=s/sc;
  float off=(h1(vec2(floor(u.y*9.),4.))-.5)*.25*b;vec2 v=u+vec2(off,0.);return (${inside})?TB(v-vec2(off*1.5,0.)):TA(v);}`;
  const LIST = [
    // camera moves (lens zoom, whips, spins): the cut happens in the middle, hidden by the motion
    ['lensIn', 'cam', `vec4 tr(vec2 u){if(p<.5){float t=ei(p*2.);return zbA(zm(u,vec2(.5),1.+2.*t),.45*t);}
  float t=eo(p*2.-1.);return zbB(zm(u,vec2(.5),2.6-1.6*t),.45*(1.-t));}`],
    ['lensOut', 'cam', `vec4 tr(vec2 u){if(p<.5){float t=ei(p*2.);return zbA(zm(u,vec2(.5),1.-.2*t),-.6*t);}
  float t=eo(p*2.-1.);return zbB(zm(u,vec2(.5),1.8-.8*t),-.6*(1.-t));}`],
    ['lensRgb', 'cam', `vec4 tr(vec2 u){float b=pow(sin(PI*p),2.);vec2 d=(u-.5)*.06*b;float k=.45*b;
  if(p<.5){vec2 v=zm(u,vec2(.5),1.+2.*ei(p*2.));vec4 g=zbA(v,k);return vec4(zbA(v+d,k).r,g.g,zbA(v-d,k).b,g.a);}
  vec2 v=zm(u,vec2(.5),2.6-1.6*eo(p*2.-1.));vec4 g=zbB(v,k);return vec4(zbB(v+d,k).r,g.g,zbB(v-d,k).b,g.a);}`],
    ['whipL', 'cam', whip(1, 0)], ['whipR', 'cam', whip(-1, 0)], ['whipU', 'cam', whip(0, -1)], ['whipD', 'cam', whip(0, 1)],
    ['whipRgb', 'cam', whip(1, 0, true)],
    ['spinZoom', 'cam', `vec4 tr(vec2 u){if(p<.5){float t=ei(p*2.);return sbA(zm(rc(u,vec2(.5),-t*2.4),vec2(.5),1.+.7*t),.9*t);}
  float t=1.-eo(p*2.-1.);return sbB(zm(rc(u,vec2(.5),t*2.4),vec2(.5),1.+.7*t),.9*t);}`],
    ['turbo', 'cam', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float k=abs(sin(p*PI*4.));float z=1.+.35*k*b+1.2*b*b;return p<.5?zbA(zm(u,vec2(.5),z),.5*b):zbB(zm(u,vec2(.5),z),.5*b);}`],
    ['shakeCam', 'cam', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*26.);vec2 o=(vec2(h1(vec2(f,1.)),h1(vec2(f,2.)))-.5)*.14*b;
  float a=(h1(vec2(f,3.))-.5)*.12*b;vec2 v=zm(rc(u,vec2(.5),a),vec2(.5),1.+.15*b)+o;return p<.5?dbA(v,o*.8):dbB(v,o*.8);}`],
    ['bounce', 'cam', `vec4 tr(vec2 u){if(p<.5){float t=ei(p*2.);vec2 v=zm(bulge(u,-.5*t),vec2(.5),1.-.35*t);return inb(v)?TA(v):bg(u);}
  float t=p*2.-1.;float s=1.-.35*exp(-5.*t)*cos(9.*t);vec2 v=zm(bulge(u,-.5*(1.-t)*(1.-t)),vec2(.5),s);return inb(v)?TB(v):bg(u);}`],
    ['focus', 'cam', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 v=zm(u,vec2(.5),1.+.08*b);vec4 c=p<.5?bA(v,.05*b):bB(v,.05*b);return c*vec4(vec3(1.+.25*b),1.);}`],
    ['blink', 'cam', `vec4 tr(vec2 u){float c=pow(sin(PI*p),2.6);float x=u.x*2.-1.;float edge=1.-c;float d=abs(u.y-.5)*2.+.12*c*x*x;
  vec4 img=p<.5?bA(u,.04*c):bB(u,.04*c);return mix(img,vec4(0.,0.,0.,1.),smoothstep(edge-.06,edge+.02,d));}`],
    ['rewind', 'cam', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*30.);vec2 v=u;v.x+=(h1(vec2(floor(u.y*70.),f))-.5)*.08*b;v.y+=b*.05*sin(p*40.);
  vec4 c=p<.5?rgbA(v,vec2(.012*b,0.)):rgbB(v,vec2(.012*b,0.));float g=dot(c.rgb,vec3(.3,.59,.11));c.rgb=mix(c.rgb,vec3(g),.6*b);
  c.rgb*=1.-.25*b*step(.5,fract(u.y*R.y/4.));return c;}`],
    ['stretchV', 'cam', stretch('y')], ['stretchH', 'cam', stretch('x')],
    ['panoL', 'cam', pano(1)], ['panoR', 'cam', pano(-1)],
    // blur
    ['blurMix', 'blur', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);return mix(bA(u,.06*b),bB(u,.06*b),smoothstep(.3,.7,p));}`],
    ['radialBlur', 'blur', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);return mix(zbA(u,.5*b),zbB(u,.5*b),smoothstep(.35,.65,p));}`],
    ['swing', 'blur', `vec4 tr(vec2 u){vec2 pv=vec2(.5,1.6);if(p<.5){float t=ei(p*2.);return sbA(rc(u,pv,-.5*t)+vec2(0.,0.),.25*t);}
  float t=1.-eo(p*2.-1.);return sbB(rc(u,pv,.5*t),.25*t);}`],
    ['blurDown', 'blur', `vec4 tr(vec2 u){float e=io(p),b=pow(sin(PI*p),3.);vec2 v=u+vec2(0.,e);vec2 d=vec2(0.,.45*b);return e<.5?dbA(v,d):dbB(v-vec2(0.,1.),d);}`],
    ['mosaic', 'blur', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float s=mix(1./R.y,.09,b*b);vec2 k=vec2(s/AS(),s);vec2 v=(floor(u/k)+.5)*k;return mixAB(v,smoothstep(.4,.6,p));}`],
    ['ink', 'blur', `vec4 tr(vec2 u){float n=fbm(sq(u)*5.);float e=p*1.25-.1;float m=smoothstep(e-.05,e,n);vec4 c=mix(TB(u),TA(u),m);
  float rim=smoothstep(.08,0.,abs(n-e+.02));return mix(c,vec4(0.,0.,0.,1.),rim*.7*sin(PI*p));}`],
    ['melt', 'blur', `vec4 tr(vec2 u){float e=ei(p);float dr=fbm(vec2(u.x*9.,1.))*.8+.2;vec2 v=u+vec2(0.,e*(1.3+dr*1.2));
  if(v.y>1.)return TB(u);return dbA(v,vec2(0.,.15*e));}`],
    ['grid', 'blur', `vec4 tr(vec2 u){vec2 n=vec2(4.,7.);vec2 c=floor(u*n);vec2 l=fract(u*n)-.5;float d=h1(c)*.5;float q=clamp((p-d*.8)/.55,0.,1.);
  float s=abs(1.-2.*io(q));if(s<.02)return bg(u);vec2 m=l/s;if(abs(m.x)>.5||abs(m.y)>.5)return bg(u);vec2 v=(c+.5+m)/n;return q<.5?TA(v):TB(v);}`],
    // glitch
    ['glitchBlock', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*22.);vec2 bl=floor(u*vec2(7.,22.));float r=h1(bl+f);
  vec2 v=u;if(r>1.-b*.7)v.x+=(h1(bl*1.7+f)-.5)*.25;vec2 d=vec2(.025*b,0.);float w=p+(h1(bl*3.1+f)-.5)*.5*b;return w<.5?rgbA(v,d):rgbB(v,d);}`],
    ['slices', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float row=floor(u.y*24.);float r=h1(vec2(row,7.));vec2 v=u+vec2((r-.5)*.6*b*b,0.);
  return p+(r-.5)*.3<.5?TA(v):TB(v);}`],
    ['digital', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 k=vec2(28./AS(),28.)*(1.-.75*b);vec2 c=floor(u*k);float r=h1(c+floor(p*14.));
  vec2 v=mix(u,(c+.5)/k,step(.85,b));vec4 col=r<p?TB(v):TA(v);col.rgb=mix(col.rgb,floor(col.rgb*6.)/6.,.5*b*b);return col;}`],
    ['vhs', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 v=u;float band=step(.92,fract(u.y*3.-p*4.));v.x+=band*.05*b+(vn(vec2(u.y*90.,p*50.))-.5)*.03*b;
  vec4 c=p<.5?rgbA(v,vec2(.02*b,0.)):rgbB(v,vec2(.02*b,0.));c.rgb+=(h1(u*R+p)-.5)*.1*b;return c;}`],
    ['smear', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float row=floor(u.y*80.);float on=step(.55,h1(vec2(row,floor(p*12.))));vec2 v=u;v.x=mix(u.x,floor(u.x*2.+h1(vec2(row,3.)))/2.,on*b);
  return p<.5?rgbA(v,vec2(.01*b,0.)):rgbB(v,vec2(.01*b,0.));}`],
    ['rgbSplit', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 d=vec2(.06,.015)*b*sign(sin(p*50.));vec2 v=zm(u,vec2(.5),1.+.1*b);return p<.5?rgbA(v,d):rgbB(v,d);}`],
    // light
    ['flash', 'light', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float w=pow(b,5.);vec4 c=p<.5?bA(u,.03*b):bB(u,.03*b);return vec4(mix(c.rgb*(1.+2.*w),vec3(1.),w),c.a);}`],
    ['leakWarm', 'light', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=mixAB(u,smoothstep(.35,.65,p));float g=exp(-pow((u.x+u.y*.4-(p*1.9-.4))*3.,2.));
  float n=fbm(u*2.+vec2(p*2.,0.));vec3 L=mix(vec3(1.,.42,.12),vec3(1.,.8,.45),n)*g*(.5+n)*b*1.1;return vec4(1.-(1.-c.rgb)*(1.-min(L,1.)),c.a);}`],
    ['leakPink', 'light', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=mixAB(u,smoothstep(.35,.65,p));float g=exp(-pow((length(u-vec2(1.,1.))-(p*1.8-.3))*2.,2.));
  float n=fbm(u*2.5-vec2(0.,p*2.));vec3 L=mix(vec3(1.,.25,.55),vec3(.6,.3,1.),n)*g*(.5+n)*b*1.2;return vec4(1.-(1.-c.rgb)*(1.-min(L,1.)),c.a);}`],
    ['flare', 'light', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=mixAB(u,smoothstep(.4,.6,p));float y=.5+.15*sin(p*3.);float s=exp(-abs(u.y-y)*60.)*(.4+.6*exp(-abs(u.x-p*1.4+.2)*3.));
  vec3 L=vec3(.55,.75,1.)*s*2.5*b+vec3(1.)*pow(b,4.)*.6;return vec4(c.rgb+L,c.a);}`],
    ['strobe', 'light', `vec4 tr(vec2 u){float k=floor(p*5.);float w=mod(k,2.);if(p>.8)w=1.;float fl=pow(1.-fract(p*5.),3.)*.35;vec4 c=X(u,w);return vec4(c.rgb+fl,c.a);}`],
    ['burn', 'light', `vec4 tr(vec2 u){float n=fbm(sq(u)*3.+vec2(0.,p));float e=p*1.3-.15;float d=e-n;vec4 c=d>0.?TB(u):TA(u);
  float rim=smoothstep(.12,0.,abs(d));vec3 hot=mix(vec3(1.,.35,.05),vec3(1.,.9,.6),smoothstep(.06,0.,abs(d)));c.rgb=mix(c.rgb,hot,rim*.95);if(d<0.&&d>-.2)c.rgb*=1.-(.2+d)*1.5;return c;}`],
    ['golden', 'light', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=mixAB(u,smoothstep(.4,.6,p));vec3 t=c.rgb*vec3(1.25,1.05,.75);return vec4(mix(c.rgb,1.-(1.-t)*(1.-t*b*1.5),b),c.a);}`],
    ['prism', 'light', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 d=(u-.5)*.06*b;vec2 v=zm(u,vec2(.5),1.+.15*b);vec4 c=mix(rgbA(v,d),rgbB(v,d),smoothstep(.4,.6,p));
  c.rgb+=vec3(sin(u.x*12.+p*9.),sin(u.x*12.+p*9.+2.),sin(u.x*12.+p*9.+4.))*.04*b;return c;}`],
    // 3D
    ['cubeL', '3d', cubeH(1)], ['cubeR', '3d', cubeH(-1)], ['cubeU', '3d', cubeV(1)], ['cubeD', '3d', cubeV(-1)],
    ['flipY', '3d', flip('y')], ['flipX', '3d', flip('x')],
    ['doors', '3d', `vec4 tr(vec2 u){float a=ei(p)*PI*.55;float h=AS();float l=1.-.5*sin(a);
  vec3 L=card(u,vec3(-h+h*cos(a),0.,h*sin(a)),vec3(cos(a),0.,sin(a)),vec3(0.,1.,0.));vec3 Q=card(u,vec3(h-h*cos(a),0.,h*sin(a)),vec3(cos(a),0.,-sin(a)),vec3(0.,1.,0.));
  bool hl=L.z>0.&&L.x<.5,hr=Q.z>0.&&Q.x>.5;if(hl&&(!hr||L.z<Q.z))return TA(L.xy)*vec4(l,l,l,1.);if(hr)return TA(Q.xy)*vec4(l,l,l,1.);return TB(zm(u,vec2(.5),.85+.15*eo(p)));}`],
    ['swap', '3d', `vec4 tr(vec2 u){float e=io(p),z=sin(PI*p)*1.6,h=AS();vec3 A=card(u,vec3(-2.2*h*e,0.,z),ry(vec3(1.,0.,0.),.7*e),vec3(0.,1.,0.));
  vec3 B=card(u,vec3(2.2*h*(1.-e),0.,z),ry(vec3(1.,0.,0.),-.7*(1.-e)),vec3(0.,1.,0.));
  if(A.z>0.&&(B.z<0.||A.z<B.z))return TA(A.xy);if(B.z>0.)return TB(B.xy);return bg(u);}`],
    ['gallery', '3d', `vec4 tr(vec2 u){float s=1.-.28*smoothstep(0.,.3,p)*(1.-smoothstep(.7,1.,p));float x=io(clamp((p-.25)/.5,0.,1.))*1.12;
  vec2 la=(u-.5-vec2(-x*s,0.))/s+.5,lb=(u-.5-vec2((1.12-x)*s,0.))/s+.5;if(inb(la))return TA(la);if(inb(lb))return TB(lb);return bg(u);}`],
    ['tiles', '3d', `vec4 tr(vec2 u){vec2 n=vec2(3.,5.);vec2 c=floor(u*n);vec2 l=fract(u*n);float q=clamp((p-(c.x+n.y-1.-c.y)/(n.x+n.y-2.)*.45)/.55,0.,1.);
  float k=abs(cos(PI*q));if(k<.02)return bg(u);float x=(l.x-.5)/k+.5;if(x<0.||x>1.)return bg(u);vec2 v=(c+vec2(x,l.y))/n;float sh=.6+.4*k;return (q<.5?TA(v):TB(v))*vec4(sh,sh,sh,1.);}`],
    ['panels', '3d', `vec4 tr(vec2 u){float i=floor(u.x*3.);float q=clamp((p-i*.12)/.64,0.,1.);float e=io(q);float sg=mod(i,2.)<.5?1.:-1.;float o=sg*(1.-e);
  vec2 v=u-vec2(0.,o);if(v.y>=0.&&v.y<=1.)return TB(v);float sh=1.-.45*smoothstep(.12,0.,abs(v.y-clamp(v.y,0.,1.)));return TA(u)*vec4(sh,sh,sh,1.);}`],
    // shape masks
    ['heart', 'mask', `float sdf(vec2 q){q.y=q.y+.55;q.x=abs(q.x);if(q.y+q.x>1.)return sqrt(dot(q-vec2(.25,.75),q-vec2(.25,.75)))-.3536;
  return sqrt(min(dot(q-vec2(0.,1.),q-vec2(0.,1.)),dot(q-.5*max(q.x+q.y,0.),q-.5*max(q.x+q.y,0.))))*sign(q.x-q.y);}
vec4 tr(vec2 u){float e=io(p);vec2 q=sq(u)/max(.001,e*2.4);return mix(TB(u),TA(u),smoothstep(-.01,.01,sdf(q)));}`],
    ['star', 'mask', `float sdf(vec2 q){float an=3.14159/5.;float en=3.14159/2.4;vec2 acs=vec2(cos(an),sin(an));vec2 ecs=vec2(cos(en),sin(en));
  float bn=mod(atan(q.x,q.y),2.*an)-an;q=length(q)*vec2(cos(bn),abs(sin(bn)));q-=.5*acs;q+=ecs*clamp(-dot(q,ecs),0.,.5*acs.y/ecs.y);return length(q)*sign(q.x);}
vec4 tr(vec2 u){float e=io(p);vec2 q=sq(u)/max(.001,e*2.6);return mix(TB(u),TA(u),smoothstep(-.01,.01,sdf(q)));}`],
    ['diamond', 'mask', `vec4 tr(vec2 u){float e=io(p);vec2 q=abs(sq(u));float d=q.x+q.y-e*1.6;return mix(TB(u),TA(u),smoothstep(-.01,.01,d));}`],
    ['clock', 'mask', `vec4 tr(vec2 u){float e=io(p);vec2 q=sq(u);float a=(atan(q.x,q.y)+PI)/(2.*PI);return mix(TB(u),TA(u),smoothstep(-.005,.005,a-e));}`],
    ['iris', 'mask', `vec4 tr(vec2 u){float r=abs(1.-2.*io(p))*1.2;float d=length(sq(u))-r;vec4 c=p<.5?TA(u):TB(u);return mix(c,vec4(0.,0.,0.,1.),smoothstep(-.01,.01,d));}`],
    ['blindsH', 'mask', blinds('y', 10)], ['blindsV', 'mask', blinds('x', 8)],
    ['checker', 'mask', `vec4 tr(vec2 u){vec2 c=floor(u*vec2(6.,10.));float odd=mod(c.x+c.y,2.);float q=clamp(p*2.-odd*.6,0.,1.);vec2 l=abs(fract(u*vec2(6.,10.))-.5);
  return max(l.x,l.y)<io(q)*.5?TB(u):TA(u);}`],
    ['torn', 'mask', `vec4 tr(vec2 u){float e=io(p)*1.6-.3;float f=u.x+u.y*.3+(fbm(u*vec2(10.,14.))-.5)*.12;float d=f-e;
  if(d<0.)return TB(u)*vec4(vec3(1.-.4*smoothstep(-.06,0.,d)),1.);if(d<.018)return vec4(.96,.95,.92,1.);return TA(u);}`],
    ['inkblot', 'mask', `vec4 tr(vec2 u){float e=io(p);vec2 q=sq(u);float d=length(q)-(e*1.3)*(.75+.5*fbm(q*3.+7.));return mix(TB(u),TA(u),smoothstep(-.02,.02,d));}`],
    ['diag', 'mask', `vec4 tr(vec2 u){float e=io(p)*1.4-.2;float d=(u.x+u.y)*.5-e;return mix(TB(u),TA(u),smoothstep(-.06,.06,d));}`],
    // slides
    ['snap', 'slide', `vec4 tr(vec2 u){float o=1.-bk(smoothstep(0.,1.,p));vec2 v=u-vec2(o,0.);if(v.x>=0.)return dbB(v,vec2(.2*abs(o)*(1.-p),0.));return TA(v+vec2(1.,0.));}`],
    ['squeeze', 'slide', `vec4 tr(vec2 u){float e=io(p);float x=1.-e;if(u.x<x)return TA(vec2(u.x/max(x,.001),u.y));return TB(vec2((u.x-x)/max(e,.001),u.y));}`],
    ['reveal', 'slide', `vec4 tr(vec2 u){float e=io(p);vec2 v=u-vec2(0.,e);vec4 b=TB(zm(u,vec2(.5),.9+.1*e))*vec4(vec3(.6+.4*e),1.);if(v.y>=0.)return TA(v);
  return mix(b,vec4(0.,0.,0.,1.),.5*smoothstep(-.06,0.,v.y));}`],
    ['split3', 'slide', `vec4 tr(vec2 u){float i=floor(u.y*3.);float q=clamp((p-i*.12)/.64,0.,1.);float e=io(q);float sg=mod(i,2.)<.5?1.:-1.;float o=sg*(1.-e);
  vec2 v=u-vec2(o,0.);if(v.x>=0.&&v.x<=1.)return dbB(v,vec2(.15*sin(PI*q),0.));return dbA(v+vec2(sg,0.),vec2(.15*sin(PI*q),0.));}`],
    ['dimSlide', 'slide', `vec4 tr(vec2 u){float s=1.-.18*sin(PI*p);float x=io(p);vec2 la=(u-.5+vec2(x*s*1.05,0.))/s+.5,lb=(u-.5-vec2((1.-x)*s*1.05,0.))/s+.5;
  if(inb(la))return TA(la)*vec4(vec3(1.-.5*x),1.);if(inb(lb))return TB(lb);return vec4(0.,0.,0.,1.);}`],
    ['pushZoom', 'slide', `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);vec2 v=zm(u,vec2(.5),1.-.25*b)+vec2(e,0.);if(v.x<=1.)return TA(v);return TB(v-vec2(1.,0.));}`],
    // distortion
    ['ripple', 'warp', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 q=sq(u);float r=length(q);vec2 v=u+normalize(q+1e-5)*sin(r*40.-p*30.)*.03*b/vec2(AS(),1.);return mixAB(v,smoothstep(.35,.65,p));}`],
    ['wave', 'warp', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 v=u+vec2(sin(u.y*18.+p*12.),cos(u.x*14.+p*9.))*.045*b;return mixAB(v,smoothstep(.35,.65,p));}`],
    ['liquid', 'warp', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 v=u+(vec2(fbm(u*3.+p*2.),fbm(u*3.+5.2-p*2.))-.5)*.35*b;return mixAB(v,smoothstep(.35,.65,p));}`],
    ['swirl', 'warp', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float a=p<.5?7.*ei(p*2.):-7.*(1.-eo(p*2.-1.));vec2 v=twirl(u,a);return p<.5?zbA(v,.25*b):zbB(v,.25*b);}`],
    ['fisheye', 'warp', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 v=bulge(u,3.*b);v=zm(v,vec2(.5),1.+.9*b);return mixAB(v,smoothstep(.42,.58,p));}`],
    ['pinch', 'warp', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 v=bulge(u,-1.8*b);return mixAB(v,smoothstep(.42,.58,p));}`],
    ['kaleido', 'warp', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 q=sq(u);float n=6.;float a=atan(q.y,q.x)+p*2.;float s=2.*PI/n;a=abs(mod(a,s)-s*.5);vec2 k=length(q)*vec2(cos(a),sin(a));
  vec2 v=mix(u,k/vec2(AS(),1.)+.5,smoothstep(.3,.95,b));return mixAB(v,smoothstep(.4,.6,p));}`],
    ['crack', 'warp', `vec2 cell(vec2 q,out float id){vec2 i=floor(q),f=fract(q);float md=9.;vec2 mc=vec2(0.);for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));
  vec2 o=vec2(h1(i+g),h1(i+g+9.));vec2 r=g+o-f;float d=dot(r,r);if(d<md){md=d;mc=i+g+o;}}id=h1(mc);return mc;}
vec4 tr(vec2 u){vec2 k=vec2(4.*AS(),4.);float id;vec2 c=cell(u*k,id);float q=clamp((p-.25-id*.25)/.5,0.,1.);if(p<.25){
  float id2;vec2 c2=cell(u*k+.02,id2);float edge=step(.001,length(c-c2));return TA(u)+vec4(vec3(edge*p*4.),0.);}
  vec2 m=(u*k-c)/(1.-q+.001)+c;float id3;vec2 c3=cell(m,id3);vec2 v=m/k+vec2(0.,-q*q*.6);if(q<1.&&length(c3-c)<.001&&inb(v))return TA(v)*vec4(vec3(1.-q*.5),1.);return TB(u);}`],
    // film: real-film looks (burns, leaks, leader, scribbles, dust) drawn in code over the cut
    ['fBurn', 'film', F + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=X(u,p);float n=fbm(vec2(u.x*1.5,u.y*2.5)+vec2(p*2.,0.));
  float x=u.x+(n-.5)*.6,e=1.25-1.7*p;float I=clamp(clamp((x-e)*1.6+.15,0.,1.)*clamp(b*1.6,0.,1.)+pow(b,6.)*.9,0.,1.);vec3 col=ramp(I);
  c.rgb=mix(scr(c.rgb,col*I),col,smoothstep(.55,1.,I));return film(c,u,b);}`],
    ['fRedLeak', 'film', F + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=p<.5?bA(u,.025*b):bB(u,.025*b);float n=fbm(vec2(u.x*3.,p*1.5));
  float band=.5+.5*sin(u.x*7.-p*9.+n*4.);float I=clamp(b*1.4*(band*.7+.3)*smoothstep(-.2,.8,u.x+p*.6-.3)+pow(b,8.)*.6,0.,1.);
  vec3 col=mix(vec3(.9,.05,.02),vec3(1.,.55,.1),band*I);c.rgb=scr(c.rgb*(1.-.35*I),col*I);return film(c,u,b*.6);}`],
    ['fPastel', 'film', F + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=X(u,p);float n=fbm(vec2(u.x*5.,u.y*.6+p));
  vec3 col=mix(vec3(1.,.62,.62),vec3(.85,.62,1.),smoothstep(.2,.8,u.x+n*.3));float st=exp(-pow((u.x-(.15+.5*p))*25.,2.))*b;
  float I=clamp(pow(b,.8)*(.55+.6*n),0.,1.);c.rgb=mix(c.rgb,scr(c.rgb,col),I);c.rgb=mix(c.rgb,vec3(1.,.95,.95),I*I*.6);
  c.rgb=scr(c.rgb,vec3(1.,.2,.3)*st);return film(c,u,b);}`],
    ['fBlue', 'film', F + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=p<.5?bA(u,.02*b):bB(u,.02*b);float s=exp(-pow((u.x*.9-u.y*.7-(p*2.4-1.))*2.5,2.));
  float l=exp(-abs(u.y-.56)*70.)*b;vec3 col=vec3(.35,.62,1.)*s*1.2+vec3(.4,.6,1.)*l+vec3(.7,.8,1.)*pow(b,3.)*.85;
  c.rgb=scr(c.rgb,col);return film(c,u,b*.5);}`],
    ['fBokeh', 'film', F + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=X(u,p);c.rgb=mix(c.rgb,c.rgb*vec3(.8,.66,.52)+vec3(.08,.05,.02),b);
  vec2 ce=mix(vec2(.15,1.25),vec2(.75,-.35),io(p));float r=.35+.75*pow(b,1.5);float m=smoothstep(r,r-.35,length(sq(u)-sq(ce)));
  c.rgb=mix(c.rgb,vec3(.96,.92,.86),m*.96);return film(c,u,b*.4);}`],
    ['fLeader', 'film', F + `vec4 tr(vec2 u){float fl=.85+.15*h1(vec2(floor(p*24.),3.));if(p<.18||p>.82){vec4 c=X(u,p);c.rgb*=fl;return film(c,u,.6);}
  float q=(p-.18)/.64,y=fract(u.y+q*3.);float fr=rr(vec2((u.x-.5)*AS(),y-.5),vec2(AS()*.5-.02,.44),.06);
  vec3 col=mix(vec3(.04),vec3(.97,.96,.93),smoothstep(.01,-.01,fr));float sx=u.x*AS();
  if(sx<.07){float hy=fract(u.y*5.+q*15.)-.5;col=mix(vec3(.03),vec3(.95),smoothstep(.004,-.004,rr(vec2(sx-.035,hy*.2),vec2(.018,.05),.01)));}
  col=mix(col,col*X(u,p).rgb,.18);return film(vec4(col*fl,1.),u,1.);}`],
    ['fStrip', 'film', F + `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);float sc=1.-.14*smoothstep(0.,.3,b);float Y=u.y+e*1.12;float k=floor(Y/1.12),ly=Y-k*1.12;
  vec3 col=vec3(.02);float ax=abs(u.x-.5);
  if(ax<sc*.5){if(ly<1.){vec2 v=vec2(.5+(u.x-.5)/sc,ly);col=(k<.5?dbA(v,vec2(0.,.2*b)):dbB(v,vec2(0.,.2*b))).rgb;}}
  else{float hx=(ax-(sc*.5+.5)*.5)*AS(),hy=(fract(Y*4.)-.5)*.25;col=mix(col,vec3(.92,.9,.85),smoothstep(.003,-.003,rr(vec2(hx,hy),vec2(.008,.05),.008)));}
  return film(vec4(col,1.),u,b*.7);}`],
    ['fLeaderRed', 'film', F + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=X(u,p);float f=floor(p*12.);float L=dot(c.rgb,vec3(.3,.59,.11));
  vec3 col=vec3(.85,.12,.06)*(.25+L)+vec3(.1,0.,0.);vec2 ce=vec2(.5+.35*sin(f*2.1),.5+.25*cos(f*1.3));float d=length(sq(u)-sq(ce));
  col=mix(col,vec3(.02),smoothstep(.38,.37,d));col=scr(col,vec3(.3,1.,.85)*exp(-pow((d-.386)*300.,2.)));
  col*=.8+.4*h1(vec2(floor(p*24.),7.));float k=smoothstep(0.,.35,b);c.rgb=mix(c.rgb,col,k);return film(c,u,k);}`],
    ['fScribble', 'film', F + scrib('vec3(.93,.88,.1)')],
    ['fScribblePink', 'film', F + scrib('vec3(1.,.05,.6)')],
    ['fDust', 'film', F + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=X(u,p);float k=smoothstep(0.,.6,b);float L=dot(c.rgb,vec3(.3,.59,.11));
  c.rgb=mix(c.rgb,vec3(L*.25+.03),k);float f=floor(p*24.);float sc=exp(-abs(u.x-h1(vec2(f,1.)))*R.x*.7)*step(.4,h1(vec2(f,2.)));
  float d=step(.996,h1(floor(u*R/4.)+f*.71));
  float hair=exp(-pow((u.y-.3-.4*h1(vec2(f,5.))+sin(u.x*9.+f)*.05)*R.y*.4,2.))*step(.8,h1(vec2(f,6.)))*step(abs(u.x-h1(vec2(f,8.))),.15);
  c.rgb+=vec3(.9,.85,.7)*(sc*.7+d+hair)*k;c.rgb*=1.-.15*k+.3*h1(vec2(f,9.))*k;return film(c,u,k);}`],
    ['fEdge', 'film', F + `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);float n=fbm(vec2(u.y*3.,p*3.));float d=u.x+(n-.5)*.25-(-.35+e*1.7);
  vec4 c=d<0.?TB(u):TA(u);vec3 col=vec3(1.,.98,.94)*exp(-pow(d*3.5,2.))+vec3(1.,.55,.1)*exp(-pow((d-.18)*9.,2.))*.8+vec3(.1,.45,.45)*exp(-pow((d+.2)*8.,2.))*.6;
  c.rgb=scr(c.rgb,col*min(1.,b*2.));return film(c,u,b);}`],
    ['fStreak', 'film', F + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=p<.5?dbA(u,vec2(0.,.04*b)):dbB(u,vec2(0.,.04*b));float y=.5+.03*sin(p*5.);
  float ln=exp(-abs(u.y-y)*40.)*(.5+.5*fbm(vec2(u.x*8.-p*6.,1.)));float bl=exp(-length(sq(u)-sq(vec2(-.1+1.2*p,y-.12)))*6.);
  vec3 col=vec3(1.,.72,.38)*ln*1.4*b+vec3(1.,.95,.85)*bl*b+vec3(.55,.32,.12)*pow(b,3.)*.6;c.rgb=scr(c.rgb*(1.-.4*b),col);
  c.rgb=mix(c.rgb,vec3(1.,.85,.6),pow(b,10.)*.85);return film(c,u,b*.5);}`],
    ['fAurora', 'film', F + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=X(u,p);vec2 q=u*vec2(2.,1.5)+vec2(p*.8,-p*.5);float a=fbm(q),g=fbm(q+5.2);
  vec3 col=mix(vec3(.45,.05,.4),vec3(.1,.75,.6),smoothstep(.35,.7,a));col=mix(col,vec3(.6,.9,.2),smoothstep(.62,.8,g)*.7);
  float I=pow(b,.7)*smoothstep(.2,.7,a+g*.4);vec3 base=c.rgb*(1.-.6*b);c.rgb=mix(base,scr(base,col*1.3),I);
  c.rgb=mix(c.rgb,col*.5,pow(b,6.)*.9);return film(c,u,b*.5);}`],
    ['fCard', 'film', F + `vec4 tr(vec2 u){float e=io(p);vec2 s=sq(u);float hw=AS()*.5+.2;float c=mix(-2.*hw-.3,2.*hw+.3,e);float x=s.x-s.y*.3,L=c-hw,Rr=c+hw;
  vec4 o=x<L?TB(u):TA(u);float m=smoothstep(L-.01,L+.01,x)*smoothstep(Rr+.01,Rr-.01,x);
  o.rgb=mix(o.rgb,vec3(.87)*(.94+.06*vn(u*R*.3)),m);o.rgb*=1.-smoothstep(.12,0.,abs(x-Rr-.04))*(1.-m)*.35;return o;}`],
    // seamless pack: zooms, spins, glitches, flats, perspective, stripes, glass, fades
    ['vZoomElastic', 'cam', G + `vec4 tr(vec2 u){if(p<.4){float t=ei(p/.4);return zbA(zm(u,vec2(.5),1.+2.*t),.5*t);}float t=(p-.4)/.6;
  return zbB(zm(u,vec2(.5),1.+.6*(1.-el(t))),.4*(1.-smoothstep(0.,.35,t)));}`],
    ['vZoomOptics', 'cam', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 v=zm(bulge(u,-2.5*b),vec2(.5),1.+1.5*b);return p<.5?zbA(v,.35*b):zbB(v,.35*b);}`],
    ['vZoomPixel', 'cam', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 v=zm(u,vec2(.5),1.+.8*b);float N=mix(500.,14.,pow(b,1.5));vec2 Gd=vec2(N*AS(),N);
  vec2 q=(floor(v*Gd)+.5)/Gd;return p<.5?zbA(q,.2*b):zbB(q,.2*b);}`],
    ['vSpinCorner', 'cam', `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);float a=e<.5?e*PI*.5:(e-1.)*PI*.5;vec4 s=vec4(0.);
  for(int i=0;i<12;i++){vec2 v=rc(u,vec2(0.),a+.3*b*(float(i)/11.-.5));s+=e<.5?TA(v):TB(v);}return s/12.;}`],
    ['vSpinElastic', 'cam', G + `vec4 tr(vec2 u){if(p<.4){float t=ei(p/.4);return sbA(rc(u,vec2(.5),t*PI*.5),.6*t);}float t=(p-.4)/.6;
  return sbB(rc(u,vec2(.5),-(1.-el(t))*PI*.5),.6*(1.-smoothstep(0.,.4,t)));}`],
    ['vCamFocus', 'cam', G + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float k=smoothstep(0.,.3,b),s=1.-.06*k;vec2 v=(u-.5)/s+.5;vec4 c=p<.5?bA(v,.05*b):bB(v,.05*b);
  c.rgb=mix(c.rgb,vec3(1.),pow(b,3.)*.7);vec2 q=(u-.5)*vec2(AS(),1.);c.rgb=mix(c.rgb,vec3(.05),smoothstep(0.,.003,rr(q,vec2(AS()*.5*s,.5*s),.03))*k);
  float ch=(step(abs(q.x),.0015)*step(abs(q.y),.04)+step(abs(q.y),.0015)*step(abs(q.x),.04))*b;c.rgb=mix(c.rgb,vec3(1.),ch*.7);return c;}`],
    ['vInvert', 'glitch', `vec4 tr(vec2 u){float f=floor(p*14.);float on=step(.25,p)*step(p,.8)*step(.35,h1(vec2(f,1.)));vec2 v=u+vec2((h1(vec2(f,2.))-.5)*.08*on,0.);
  vec4 c=X(v,p);if(on>.5)c.rgb=1.-c.rgb;return c;}`],
    ['vBadSignal', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*20.),row=floor(u.y*60.);
  float j=(h1(vec2(row,f))-.5)*.25*b*b*step(.6,h1(vec2(row*.3,f+3.)));vec2 v=u+vec2(j+sin(u.y*400.+p*90.)*.004*b,0.);vec4 c=X(v,p);
  float L=dot(c.rgb,vec3(.3,.59,.11));c.rgb=mix(c.rgb,vec3(L)*1.2+.1,smoothstep(.3,.9,b));c.rgb+=(h1(u*R+f)-.5)*.25*b;return c;}`],
    ['vTvNoise', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*30.);float n=h1(floor(u*R*.5)+f*1.7),s=smoothstep(.25,.75,b);
  vec4 c=X(u+vec2(0.,(h1(vec2(f,4.))-.5)*.1*s),p);c.rgb=mix(c.rgb,vec3(n)-step(.85,fract(u.y*3.+p*4.))*.25,s*.95);return c;}`],
    ['vAberr', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*16.),row=floor(u.y*24.);vec2 v=u+vec2((h1(vec2(row,f))-.5)*.3*b,0.),d=vec2(.03*b,0.),m=vec2(.2*b,0.);
  return p<.5?vec4(dbA(v+d,m).r,dbA(v,m).g,dbA(v-d,m).b,1.):vec4(dbB(v+d,m).r,dbB(v,m).g,dbB(v-d,m).b,1.);}`],
    ['vMagnify', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*12.);vec2 v=u;float hit=0.;
  for(int i=0;i<5;i++){float fi=float(i);vec2 c0=vec2(h1(vec2(f,fi)),h1(vec2(fi,f+1.))),hs=vec2(.08+.2*h1(vec2(f+fi,2.)),.03+.08*h1(vec2(f,fi+5.)));
    if(abs(u.x-c0.x)<hs.x&&abs(u.y-c0.y)<hs.y&&h1(vec2(fi,f*3.))<b){v=c0+(u-c0)/1.8+vec2(.05,0.);hit=1.;}}
  vec4 c=p<.5?rgbA(v,vec2(.012*b,0.)):rgbB(v,vec2(.012*b,0.));float bar=step(abs(u.y-h1(vec2(f,9.))),.006)*step(u.x,h1(vec2(f,10.)))*b;
  c.rgb=mix(c.rgb,vec3(1.,.55,.2),bar*.8)*(1.+.25*hit*b);return c;}`],
    ['vOffset', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*10.);float o=(h1(vec2(f,3.))-.5)*.8*b;float x=fract(u.x+o);vec2 v=vec2(x,u.y);
  vec4 c=p<.5?rgbA(v,vec2(.02*b,0.)):rgbB(v,vec2(.02*b,0.));c.rgb+=(exp(-x*200.)+exp(-(1.-x)*200.))*.3*b;return c;}`],
    ['vElastic', 'slide', flatE('el')],
    ['vBounce', 'slide', flatE('bo')],
    ['vSplit2', 'slide', `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);float sg=u.y>.5?1.:-1.;vec2 v=u+vec2(sg*e,0.),d=vec2(.2*b,0.);
  if(v.x>=0.&&v.x<=1.)return dbA(v,d);return dbB(v-vec2(sg,0.),d);}`],
    ['vPerspIn', '3d', persp(1, '.6')],
    ['vPerspOut', '3d', persp(-1, '-.4')],
    ['vStripesD', 'mask', stripes('.785', 7)],
    ['vStripesH', 'mask', stripes('0.', 8)],
    ['vStripesV', 'mask', stripes('1.5708', 8)],
    ['vGlass', 'warp', G + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 s=sq(u);vec2 d=vec2(.7071,-.7071);float band=floor(dot(s,vec2(-d.y,d.x))*3.5+100.);
  float t=clamp((p-.35*fract(band*.618))/.65,0.,1.),e=io(t),S=AS()*abs(d.x)+abs(d.y),x=dot(s,d),edge=mix(-S*.5-.15,S*.5+.15,e);
  vec2 off=d*(1.-e)*.35/vec2(AS(),1.);vec4 c=x<edge?rgbB(u+off,vec2(.008*sin(PI*t),0.)):TA(u-d*e*.05/vec2(AS(),1.));
  c.rgb+=exp(-abs(x-edge)*120.)*.6*sin(PI*t);return c;}`],
    ['vGlassBroken', 'warp', G + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 k=vec2(5.*AS(),5.);vec2 c=cell(u*k);vec2 v=u+(vec2(h1(c),h1(c+3.))-.5)*.25*b;
  float edge=step(.001,length(c-cell(u*k+.015)))*b;vec4 o=p<.5?rgbA(v,vec2(.01*b,0.)):rgbB(v,vec2(.01*b,0.));o.rgb+=edge*.5;return o;}`],
    ['vWarp', 'warp', `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);vec2 v=vec2(.5+(u.x-.5)/(1.+3.*b)+e*2.,u.y+sin(u.x*12.+p*8.)*.03*b),d=vec2(.3*b,0.);
  return e<.5?dbA(v,d):dbB(v-vec2(2.,0.),d);}`],
    ['vExposure', 'light', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=p<.5?bA(u,.01*b):bB(u,.01*b);c.rgb=mix(c.rgb,1.-exp(-c.rgb*(1.+4.*pow(b,1.5))),smoothstep(0.,.3,b));
  c.rgb=mix(c.rgb,vec3(1.),pow(b,6.));return c;}`],
    ['vFadeBlur', 'blur', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=p<.5?bA(u,.05*b):bB(u,.05*b);c.rgb*=1.-b*b;return c;}`],
      // colour shapes (116 pack mogrts): flat layered wipes
    ['shDiag', 'shape', shape('(u.x*AS()+(1.-u.y)*.6)/(AS()+.6)', 'vec3(1.,.36,.18)', 'vec3(.95,.95,.93)', 'vec3(0.,.62,.66)')],
    ['shPill', 'shape', shape('(u.x+.12*(1.-sqrt(max(1.-4.*pow(fract(u.y*5.)-.5,2.),0.)))+h1(vec2(floor(u.y*5.),3.))*.25)/1.37', 'vec3(.12,.72,.5)', 'vec3(.6,.92,.76)', 'vec3(.97,.96,.88)')],
    ['shZig', 'shape', shape('((1.-u.y)+.12*abs(fract(u.x*AS()*4.)-.5))/1.06', 'vec3(.24,.27,.31)', 'vec3(0.,.62,.66)', 'vec3(.6,.9,.82)')],
    ['shSteps', 'shape', shape('(u.x+floor((1.-u.y)*5.)*.07)/1.3', 'vec3(.24,.27,.31)', 'vec3(.7,.86,.9)', 'vec3(.97,.95,.88)')],
    ['shArc', 'shape', shape('length(s-vec2(-AS()*.5,-.5))/length(vec2(AS(),1.))', 'vec3(.97,.95,.88)', 'vec3(1.,.42,.25)', 'vec3(.85,.25,.04)')],
    ['shCircle', 'shape', shape('length(s)/(.5*length(vec2(AS(),1.)))', 'vec3(.6,.9,.82)', 'vec3(.24,.27,.31)', 'vec3(0.,.62,.66)')],
    ['shBars', 'shape', shape('(u.y+h1(vec2(floor(u.x*6.),7.))*.35)/1.35', 'vec3(.97,.95,.88)', 'vec3(0.,.62,.66)', 'vec3(1.,.36,.18)')],
    ['shPyramid', 'shape', shape('(u.y+floor(abs(s.x)*7.)*.09)/(1.+floor(AS()*3.5)*.09)', 'vec3(.2,.3,.5)', 'vec3(.97,.95,.88)', 'vec3(.7,.86,.9)')],
    ['shSquare', 'shape', shape('(abs(rot(s,p*PI*.5).x)+abs(rot(s,p*PI*.5).y))/(.5*(AS()+1.))', 'vec3(.24,.27,.31)', 'vec3(0.,.62,.66)', 'vec3(1.,.36,.18)')],
    ['shChevron', 'shape', shape('(u.x+abs(u.y-.5)*.8)/1.4', 'vec3(.24,.27,.31)', 'vec3(.95,.95,.93)', 'vec3(.9,.1,.14)')],
    ['shStripes', 'shape', shape('((1.-u.y)+mod(floor((u.x*AS()+u.y)*5.),2.)*.3)/1.3', 'vec3(0.,.62,.66)', 'vec3(.95,.95,.93)', 'vec3(1.,.36,.18)')],
    // ink (116 pack): splash from a corner with drops, a drip from the top, and through black ink
    ['inkSpread', 'mask', `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);vec2 s=sq(u);float n=fbm(s*3.+3.);float d=length(s-vec2(.15*AS(),.2))*.9-.55*n+.25;
  vec2 g=floor(s*14.);vec2 f=fract(s*14.)-.5-(vec2(h1(g),h1(g+4.))-.5)*.5;float dt=step(length(f),.08+.18*h1(g+9.))*step(.55,h1(g+2.));
  float th=e*1.6-.4;float m=max(1.-smoothstep(th-.04,th,d),dt*step(d-.35*h1(g+6.),th));
  float rim=(1.-smoothstep(0.,.12,abs(d-th)))*b;vec4 c=mix(TA(u),TB(u),m);c.rgb*=1.-.75*rim*(.5+.5*fbm(s*12.));return c;}`],
    ['inkDrip', 'mask', `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);float n=fbm(vec2(u.x*5.,p*1.5))*.18+vn(vec2(u.x*60.,1.))*.04*step(.6,vn(vec2(u.x*14.,3.)));
  float ed=(1.-u.y)-n,th=e*1.45-.25;float m=1.-smoothstep(th-.03,th,ed);float rim=(1.-smoothstep(0.,.1,abs(ed-th)))*b;
  vec4 c=mix(TA(u),TB(u),m);c.rgb*=1.-.6*rim*fbm(u*vec2(30.,8.));return c;}`],
    ['inkBlack', 'mask', `vec4 tr(vec2 u){vec2 s=sq(u);float q=p<.5?io(p*2.):1.-io(p*2.-1.);float n=fbm(s*2.5+(p<.5?1.:7.));float d=length(s)*.8-.6*n+.3,th=q*1.4-.35;
  float m=1.-smoothstep(th-.05,th,d);float rim=(1.-smoothstep(0.,.08,abs(d-th)))*step(.01,q)*step(q,.99);vec4 c=X(u,p);c.rgb=mix(c.rgb,vec3(.02),max(m,rim*.6));return c;}`],
    // pixel experts packs: echo trails, posterize, mirror bevels, turbulence, invert, hue shake, wave flashes
    ['pxEcho', 'blur', echo(false)],
    ['pxEchoInv', 'glitch', echo(true)],
    ['pxPoster', 'glitch', poster(false)],
    ['pxPosterRed', 'glitch', poster(true)],
    ['pxBevel', 'warp', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 v=(u-.5)/(1.-.55*b)+.5;vec4 c=X(v,p);vec2 f=fract(v);
  float ed=min(min(f.x,1.-f.x)*AS(),min(f.y,1.-f.y));float k=1.-(1.-smoothstep(.0,.05,ed))*smoothstep(0.,.15,b);c.rgb*=mix(.35,1.,k)+(1.-k)*.5*(f.x+f.y-1.);
  c.rgb=mix(c.rgb,c.rgb*vec3(1.15,.95,1.1),b);return c;}`],
    ['pxTurb', 'warp', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*18.);vec2 q=u*vec2(AS(),1.)*3.+f*.37;vec2 d=(vec2(fbm(q),fbm(q+5.2))-.5)*.35*b*b;
  return p<.5?rgbA(u+d,d*.15):rgbB(u+d,d*.15);}`],
    ['pxBlurInv', 'blur', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=p<.5?bA(u,.06*b):bB(u,.06*b);c.rgb=mix(c.rgb,1.-c.rgb,smoothstep(.35,.5,p)*(1.-smoothstep(.5,.65,p)));return c;}`],
    ['pxHueShake', 'cam', PX + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*24.);vec2 o=(vec2(h1(vec2(f,1.)),h1(vec2(f,2.)))-.5)*.08*b;vec2 v=zm(u+o,vec2(.5),1.+.1*b);
  vec4 c=p<.5?dbA(v,o*.6):dbB(v,o*.6);c.rgb=clamp(hue(c.rgb,b*PI*1.5*(h1(vec2(f,5.))>.5?1.:-1.)),0.,1.);return c;}`],
    ['pxWaveFlash', 'light', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=X(u+vec2(sin(u.y*20.+p*30.)*.03*b,0.),p);c.rgb=mix(c.rgb,vec3(1.),step(.6,h1(vec2(floor(p*14.),2.)))*b*.7);return c;}`],
    // glitch presets (116 pack): black stutter, emboss, rgb centre warp, colour ghosts, cyan blocks
    ['gStutter', 'glitch', `vec4 tr(vec2 u){float blk=step(.3,p)*step(p,.5)*mod(floor(p*16.),2.);vec2 v=zm(u,vec2(.5),1.+(p>.5?.25*(1.-eo((p-.5)*2.)):0.));vec4 c=X(v,p);c.rgb*=1.-blk;return c;}`],
    ['gEmboss', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 d=vec2(2./R.x,2./R.y)*(1.+6.*b);vec4 c=X(u,p);vec4 e=X(u+d,p)-X(u-d,p);
  float on=step(.4,h1(vec2(floor(p*14.),4.)))*smoothstep(.1,.5,b);c.rgb=mix(c.rgb,(.5+e.rgb*2.)*vec3(.9,1.,1.1),on);return c;}`],
    ['gRgbWarp', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 v=bulge(u,.8*b);float k=.25*b;
  return p<.5?vec4(zbA(v,k*1.4).r,zbA(v,k).g,zbA(v,k*.6).b,1.):vec4(zbB(v,k*1.4).r,zbB(v,k).g,zbB(v,k*.6).b,1.);}`],
    ['gGhost', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*12.);vec2 o=vec2(.04+.04*h1(vec2(f,1.)),.02*(h1(vec2(f,2.))-.5))*b;
  vec4 c=X(u,p);vec3 g1=X(u+o,p).rgb,g2=X(u-o,p).rgb;c.rgb=c.rgb*(1.-.4*b)+(g1*vec3(0.,.4,.2)+g2*vec3(.4,0.,.2))*b;return c;}`],
    ['gCyan', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*15.);vec2 bl=floor(u*vec2(6.,14.));float on=step(.55,h1(bl+f))*b;
  vec4 c=X(u+vec2((h1(bl+f+3.)-.5)*.2*on,0.),p);c.rgb=mix(c.rgb,vec3(0.,.9,1.)*dot(c.rgb,vec3(.3,.59,.11))*1.5,on*.8);c.rgb*=1.-.08*b*step(.5,fract(u.y*R.y*.25));return c;}`],
    // tech nestology 1000+ pack
    ['nBoxBounce', '3d', G + cubeV(1).replace('io(p)', 'bo(p)')],
    ['nBoxSwing', '3d', G + cubeV(1).replace('io(p)', 'bk(p)')],
    ['nHeart', 'mask', dshape('pow(dot(q*2.,q*2.)-1.,3.)-q.x*q.x*4.*q.y*q.y*q.y*8.<0.', '3.5')],
    ['nArrow', 'mask', dshape('(abs(q.y+0.)<.25&&q.x+(1.-e)*.3>-.8&&q.x<.1)||(q.x>=-.1&&abs(q.y)<(.9-q.x)*.9)', '6.')],
    ['nBlocks', 'warp', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 g=floor(u*vec2(5.,8.));float off=(h1(g+2.)-.5)*.4*b*step(.3,h1(g+5.));vec2 v=u+vec2(off,0.);
  return p>h1(g)*.6+.2?TB(v):TA(v);}`],
    ['nBevel', 'warp', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 s=sq(u);float y=dot(s,vec2(-.6,.8))*7.,bd=floor(y);float off=(h1(vec2(bd,2.))-.5)*.5*b;
  vec2 v=u+vec2(.8,.6)*off/vec2(AS(),1.);vec4 c=p>.2+.6*h1(vec2(bd,1.))?TB(v):TA(v);c.rgb*=1.-.35*b*smoothstep(.8,1.,fract(y));return c;}`],
    ['nMonitor', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float f=floor(p*14.),row=floor(u.y*30.);float r=h1(vec2(row,f));
  vec4 c=X(u+vec2((h1(vec2(row,f+7.))-.5)*.3*b*step(.5,r),0.),p);vec3 col=r>.92?vec3(1.,.1,.1):r>.84?vec3(.1,1.,.2):vec3(.15,.2,1.);
  c.rgb=mix(c.rgb,col*(.4+c.rgb),step(.75,r)*b*.85);c.rgb*=1.-.15*b*step(.5,fract(u.y*R.y*.5));return c;}`],
    ['nSatellite', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);float s=smoothstep(.2,.6,b),f=floor(p*24.),ry=floor(u.y*16.);
  float n=h1(floor(u*vec2(80.,45.)*vec2(1.,.4+.6*h1(vec2(floor(u.y*12.),f))))+f*3.1);vec3 sn=mix(vec3(n)*vec3(.9,.8,1.)*.7,vec3(.9,.2,.8)*n,step(.93,h1(vec2(floor(u.y*40.),f))));
  vec4 c=X(u+vec2((h1(vec2(floor(u.y*20.),f))-.5)*.1*s,0.),p);c.rgb=mix(c.rgb*(1.-.7*s),sn,s*step(.3,h1(vec2(ry,f+1.))));return c;}`],
    ['n3dPan', '3d', `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);float h=AS();vec3 e1=rx(ry(vec3(1.,0.,0.),.35*b),.5*b),e2=rx(vec3(0.,1.,0.),.5*b);
  vec3 A=card(u,vec3(-e*2.2*h,.3*b,.6*b),e1,e2),B=card(u,vec3((1.-e)*2.2*h,.3*b,.6*b),e1,e2);
  if(A.z>0.)return dbA(A.xy,vec2(.1*b,0.));if(B.z>0.)return dbB(B.xy,vec2(.1*b,0.));return bg(u);}`],
    ['nFlight', 'blur', N + `vec4 tr(vec2 u){vec2 c=vec2(1.1,1.05);float t=p<.5?ei(p*2.):1.-eo(p*2.-1.);vec2 v=zm(u,c,1.+2.5*t)+vec2(-.25,-.2)*(p<.5?t:-t);return zc(v,c,.6*t,p>=.5);}`],
    ['shRings', 'shape', shape('length(s)/(.5*length(vec2(AS(),1.)))*.85+.15*step(.5,fract(atan(s.y,s.x)/6.2832*2.+p*1.5))', 'vec3(.45,.75,.65)', 'vec3(1.,.6,.3)', 'vec3(0.,.85,1.)')],
    ['shRhomb', 'shape', shape('((1.-u.y)-.4*(1.-2.*abs(u.x-.5))+.4)/1.4', 'vec3(.97,.95,.88)', 'vec3(.15,.15,.17)', 'vec3(.96,.33,.3)')],
    ['nFrost', 'mask', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 s=sq(u);float n=fbm(s*6.+fbm(s*3.)*2.);float cr=pow(fbm(s*24.+n*4.),3.),b3=b*b*b;
  vec4 c=mixAB(u+(n-.5)*.03*b,smoothstep(.45,.6,p));float m=smoothstep(0.,.25,b3*1.3-(1.-n)*.8);c.rgb=mix(c.rgb,vec3(.75,.88,.95)*(.4+.6*n)+cr*.4,m);return c;}`],
    ['nTarget', 'cam', N + `vec4 tr(vec2 u){if(p<.5){float t=ei(p*2.);vec2 c=vec2(.68,.62);return zc(zm(u,c,1.+5.*t),c,.4*t,false);}
  float t=1.-eo(p*2.-1.);vec2 c=vec2(.4,.45);return zc(zm(u,c,1.+5.*t),c,.4*t,true);}`],
    ['nTunnel', 'warp', `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);float k=.98*b+.001;float xs=asin(clamp((u.x-.5)*2.*k,-1.,1.))/asin(k)*.5;
  vec2 v=vec2(.5+xs+e*2.,u.y),d=vec2(.35*b,0.);vec4 c=e<.5?dbA(v,d):dbB(v-vec2(2.,0.),d);c.rgb*=1.-.5*b*pow(abs(u.x-.5)*2.,2.);return c;}`],
    ['nTilt', 'cam', `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);vec2 c=u-.5;c.x*=1.+.5*b*c.y;vec2 v=c+.5+vec2(0.,e),d=vec2(0.,.3*b);return e<.5?dbA(v,d):dbB(v-vec2(0.,1.),d);}`],
    ['nVrRotate', 'warp', `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);vec2 s=sq(u);vec2 pl=vec2(fract(atan(s.y,s.x)/6.2832+.5+e),clamp(length(s)*1.2,0.,1.));
  return X(mix(u,pl,smoothstep(0.,.6,b)),p);}`],
    ['nVrStretch', 'warp', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 v=u+vec2(sin(u.y*7.+p*9.)*.12,sin(u.x*5.+p*4.)*.06)*b,d=vec2(.5*b,.1*b),o=vec2(.04*b,0.);
  vec4 c=p<.5?vec4(dbA(v+o,d).r,dbA(v,d).g,dbA(v-o,d).b,1.):vec4(dbB(v+o,d).r,dbB(v,d).g,dbB(v-o,d).b,1.);c.rgb=mix(c.rgb,1.-(1.-c.rgb)*.7,b*.5);return c;}`],
    ['nVrBend', 'warp', `vec4 tr(vec2 u){float e=io(p),b=max(sin(PI*p),0.);vec2 v=vec2(u.x+e*2.,u.y+sin(u.x*PI*2.+e*6.)*.12*b),d=vec2(.3*b,.05*b),o=vec2(.03*b,0.);
  if(e<.5)return vec4(dbA(v+o,d).r,dbA(v,d).g,dbA(v-o,d).b,1.);v.x-=2.;return vec4(dbB(v+o,d).r,dbB(v,d).g,dbB(v-o,d).b,1.);}`],
    ['nVrRay', 'light', N + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 s=sq(u);vec4 c=zc(u,vec2(.5,.45),.5*b,p>=.5);c.rgb+=b*b*vec3(1.,.95,.7)*.6;
  c.rgb*=mix(vec3(1.),.7+.3*cos(vec3(0.,2.,4.)+atan(s.y,s.x)*3.),b*.6);return c;}`],
    ['nVrZoom', 'light', N + `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec4 c=zc(bulge(u,3.*b),vec2(.5),.3*b,p>=.5);c.rgb+=exp(-length(sq(u))*4./(b+.01))*b*1.5;
  c.rgb=mix(c.rgb,vec3(1.),pow(b,4.)*.8);return c;}`],
    // ---- library 3: patterns, slides, 3D, camera, glitch, light, warp, film (id, category, GLSL, English, Arabic) ----
    ['xHex', 'geo', `vec4 tr(vec2 u){vec2 s=sq(u)*7.;vec2 r=vec2(1.,1.7320508),h=r*.5;vec2 a=mod(s,r)-h,b=mod(s-h,r)-h;vec2 g=dot(a,a)<dot(b,b)?a:b;vec2 id=s-g;
  float d=length(id)/7./(.5*length(vec2(AS(),1.)));float t=clamp((p*1.6-d*.6)*1.8,0.,1.);float hx=max(abs(g.x),abs(g.x)*.5+abs(g.y)*.866);
  vec4 c=hx<t*.51?TB(u):TA(u);c.rgb*=1.-.5*step(t*.51-.03,hx)*step(hx,t*.51)*step(.01,t)*step(t,.99);return c;}`, 'Honeycomb', 'خلية نحل'],
    ['xTri', 'geo', `vec4 tr(vec2 u){vec2 s=sq(u)*6.,c=floor(s),f=fract(s);float k=step(f.x,f.y);float r=h1(c+k*.37);float t=clamp((p-r*.5)*2.,0.,1.);
  vec2 m=k>.5?vec2(1./3.,2./3.):vec2(2./3.,1./3.);float w=abs(t*2.-1.);vec2 q=m+(f-m)/max(w,.001);
  bool ins=k>.5?(q.y>=q.x&&q.x>=0.&&q.y<=1.):(q.x>=q.y&&q.y>=0.&&q.x<=1.);return ins?(t<.5?TA(u):TB(u)):bg(u);}`, 'Triangles', 'مثلثات'],
    ['xDots', 'geo', `vec4 tr(vec2 u){vec2 s=sq(u)*10.;vec2 c=floor(s)+.5;float d=length(c)/10./(.5*length(vec2(AS(),1.)));float t=clamp(p*1.7-d*.7,0.,1.);return length(s-c)<t*.72?TB(u):TA(u);}`, 'Growing dots', 'نقط بتكبر'],
    ['xDotsDiag', 'geo', `vec4 tr(vec2 u){vec2 s=sq(u)*10.;vec2 c=floor(s)+.5;float d=(u.x+u.y)*.5;float t=clamp(p*1.7-d*.7,0.,1.);return length(s-c)<t*.72?TB(u):TA(u);}`, 'Diagonal dots', 'نقط مايلة'],
    ['xSpiral', 'geo', `vec4 tr(vec2 u){vec2 s=sq(u);float a=atan(s.y,s.x)/6.2832+.5;float r=length(s)/(.5*length(vec2(AS(),1.)));float v=(floor(r*3.-a)+a)/3.;return v<io(p)*1.4-.35?TB(u):TA(u);}`, 'Spiral', 'حلزونة'],
    ['xFan', 'geo', `vec4 tr(vec2 u){vec2 s=sq(u);float a=fract((atan(s.y,s.x)/6.2832+.5)*6.);return a<io(p)*1.01?TB(u):TA(u);}`, 'Windmill', 'طاحونة'],
    ['xZig', 'geo', `vec4 tr(vec2 u){float z=abs(fract(u.y*8.)-.5)*.12;float e=io(p)*1.14-.07;return u.x<e+z-.06?TB(u):TA(u);}`, 'Zigzag wipe', 'مسح زجزاج'],
    ['xWave', 'geo', `vec4 tr(vec2 u){float e=io(p)*1.3-.15;float w=sin(u.y*12.+p*8.)*.05;return mix(TB(u),TA(u),smoothstep(e+w-.03,e+w+.03,u.x));}`, 'Wavy wipe', 'مسح متموّج'],
    ['xPlus', 'geo', `vec4 tr(vec2 u){vec2 s=abs(u-.5)*2.;return min(s.x,s.y)<io(p)*1.01?TB(u):TA(u);}`, 'Plus', 'علامة زائد'],
    ['xBoxIn', 'geo', `vec4 tr(vec2 u){vec2 s=abs(u-.5)*2.;return max(s.x,s.y)<1.001-io(p)?TA(u):TB(u);}`, 'Box in', 'مربع لجوّه'],
    ['xBoxOut', 'geo', `vec4 tr(vec2 u){vec2 s=abs(u-.5)*2.;return max(s.x,s.y)<io(p)*1.01?TB(u):TA(u);}`, 'Box out', 'مربع لبرّه'],
    ['xDiagDoors', 'geo', `vec4 tr(vec2 u){return abs(u.x+u.y-1.)<io(p)*1.01?TB(u):TA(u);}`, 'Diagonal doors', 'أبواب مايلة'],
    ['xRings', 'geo', `vec4 tr(vec2 u){float r=length(sq(u))/(.5*length(vec2(AS(),1.)));float k=floor(r*6.),f=fract(r*6.);float t=clamp(p*1.5-k/6.*.5,0.,1.);bool on=mod(k,2.)<.5?f<t:f>1.-t;return on?TB(u):TA(u);}`, 'Rings', 'حلقات'],
    ['xCorner', 'geo', `vec4 tr(vec2 u){return length(u)/1.4143<io(p)*1.01?TB(u):TA(u);}`, 'Corner sweep', 'من الركن'],
    ['xVenetian', 'geo', `vec4 tr(vec2 u){float x=(u.x+u.y)*.5;float f=fract(x*8.);float t=clamp(p*1.4-x*.4,0.,1.);return f<t*1.01?TB(u):TA(u);}`, 'Diagonal blinds', 'شيش مايل'],
    ['xTiles', 'geo', `vec4 tr(vec2 u){vec2 s=sq(u)*3.,c=floor(s),f=fract(s);float t=clamp(p*1.6-h1(c)*.6,0.,1.);float w=abs(cos(t*PI));float x=.5+(f.x-.5)/max(w,.001);
  if(x<0.||x>1.)return bg(u);vec2 v=(c+vec2(x,f.y))/3./vec2(AS(),1.)+.5;vec4 k=t<.5?TA(v):TB(v);k.rgb*=.55+.45*w;return k;}`, 'Flipping tiles', 'بلاطات بتتقلب'],
    ['xAperture', 'geo', `vec4 tr(vec2 u){vec2 s=sq(u);float e=io(p);s=rot(s,e*1.2);float a=atan(s.y,s.x);float sg=PI/3.;float d=length(s)*cos(mod(a,sg)-sg*.5)/cos(sg*.5);float r0=e*length(vec2(AS(),1.))*.62;
  vec4 c=d<r0?TB(u):TA(u);c.rgb*=1.-.8*exp(-abs(d-r0)*90.)*step(.01,e)*step(e,.99);return c;}`, 'Camera aperture', 'فتحة عدسة'],
    ['xBubbles', 'geo', `vec4 tr(vec2 u){vec2 s=sq(u)*5.;vec2 c=floor(s);float m=0.;for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++){vec2 g=c+vec2(float(i),float(j));vec2 o=vec2(h1(g),h1(g+5.3));float st=h1(g+9.1)*.6;float r=clamp((p-st)/.4,0.,1.)*1.6;m=max(m,step(length(s-g-o),r));}return m>.5?TB(u):TA(u);}`, 'Bubbles', 'فقاعات'],
    ['xSquares', 'geo', `vec4 tr(vec2 u){vec2 s=sq(u)*9.,c=floor(s),f=fract(s)-.5;float t=clamp((p-h1(c)*.6)/.4,0.,1.);return max(abs(f.x),abs(f.y))<t*.51?TB(u):TA(u);}`, 'Random squares', 'مربعات عشوائية'],
    ['xBricks', 'geo', `vec4 tr(vec2 u){vec2 s=u*vec2(5.,10.);s.x+=mod(floor(s.y),2.)*.5;vec2 c=floor(s),f=fract(s);float st=h1(c)*.4+u.x*.4;float t=clamp((p-st)/.2,0.,1.);return f.y<t*1.01?TB(u):TA(u);}`, 'Bricks', 'طوب'],
    ['xFlipStrips', 'geo', `vec4 tr(vec2 u){float n=8.,k=floor(u.x*n),f=fract(u.x*n);float t=clamp(p*1.6-k/n*.6,0.,1.);float w=abs(cos(t*PI));float x=.5+(f-.5)/max(w,.001);
  if(x<0.||x>1.)return bg(u);vec2 v=vec2((k+x)/n,u.y);vec4 c=t<.5?TA(v):TB(v);c.rgb*=.6+.4*w;return c;}`, 'Flipping strips', 'شرايط بتتقلب'],
    ['xVoronoi', 'geo', `vec4 tr(vec2 u){vec2 s=sq(u)*5.,c=floor(s);float md=9.,md2=9.;vec2 mg=vec2(0.);for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++){vec2 g=c+vec2(float(i),float(j));float d=length(s-g-vec2(h1(g),h1(g+4.1)));if(d<md){md2=md;md=d;mg=g;}else if(d<md2)md2=d;}
  float t=h1(mg+2.7);vec4 k=t*.8<p*.95-.02?TB(u):TA(u);k.rgb+=vec3(1.,.9,.6)*(1.-smoothstep(0.,.06,md2-md))*sin(PI*p);return k;}`, 'Cells', 'خلايا'],
    ['xNoise', 'mask', `vec4 tr(vec2 u){float n=fbm(sq(u)*4.);float w=p*1.4-.2;return mix(TB(u),TA(u),smoothstep(w-.04,w+.04,n));}`, 'Cloud dissolve', 'ذوبان سحاب'],
    ['xBlocks', 'mask', `vec4 tr(vec2 u){vec2 c=floor(sq(u)*14.);return h1(c)<p?TB(u):TA(u);}`, 'Block dissolve', 'ذوبان بلوكات'],
    ['xDrop', 'mask', `vec4 tr(vec2 u){vec2 s=sq(u);float r=length(s);float e=io(p)*length(vec2(AS(),1.))*.55;float w=sin((r-e)*50.)*exp(-abs(r-e)*14.)*.035*sin(PI*p);vec2 v=u+s/(r+1e-4)/vec2(AS(),1.)*w;return r<e?TB(v):TA(v);}`, 'Water drop', 'نقطة ماية'],
    ['xLightning', 'mask', `vec4 tr(vec2 u){float j=(vn(vec2(u.y*20.,3.))-.5)*.15+(vn(vec2(u.y*60.,7.))-.5)*.05;float e=io(p)*1.6-.25;float d=u.x+u.y*.2-.1+j-e;vec4 c=d<0.?TB(u):TA(u);c.rgb+=vec3(.6,.8,1.)*exp(-abs(d)*60.)*sin(PI*p)*1.5;return c;}`, 'Lightning', 'برق'],
    ['xSmokeWipe', 'mask', `vec4 tr(vec2 u){float n=fbm(sq(u)*3.+vec2(0.,p*2.));float e=io(p)*1.8-.4;float m=smoothstep(e-.15,e+.15,u.x+(n-.5)*.4);vec4 c=mix(TB(u),TA(u),m);c.rgb=mix(c.rgb,vec3(.85),(1.-abs(m*2.-1.))*.6*n);return c;}`, 'Smoke wipe', 'مسح دخان'],
    ['xBrush', 'mask', `vec4 tr(vec2 u){float k=floor(u.y*7.);float st=h1(vec2(k,1.))*.35;float t=clamp((p-st)/.65,0.,1.);float x=mod(k,2.)<.5?u.x:1.-u.x;return x<t*1.15-vn(vec2(u.y*40.,k))*.15?TB(u):TA(u);}`, 'Brush strokes', 'ضربات فرشاة'],
    ['xSplash', 'mask', `vec4 tr(vec2 u){vec2 s=sq(u);float a=atan(s.y,s.x);float r=length(s)/(.5*length(vec2(AS(),1.)));float sh=.75+.35*vn(vec2(a*2.5+3.,1.))+.15*vn(vec2(a*9.,4.));
  float k1=ei(clamp(p*1.6,0.,1.))*1.5,k2=ei(clamp(p*1.6-.6,0.,1.))*1.5;if(r<k2*sh)return TB(u);if(r<k1*sh)return vec4(vec3(1.,.32,.45)*(.85+.15*vn(s*8.)),1.);return TA(u);}`, 'Paint splash', 'رشة بوية'],
    ['xSand', 'mask', `vec4 tr(vec2 u){vec2 g=floor(u*R/2.);float n=h1(g);if(n<p*1.15-.08)return TB(u);return TA(u-vec2(p*.18*h1(g+1.),0.));}`, 'Sand', 'رمل'],
    ['xEmber', 'light', `vec4 tr(vec2 u){float n=fbm(sq(u)*4.);float w=p*1.4-.2;vec4 c=mix(TB(u),TA(u),smoothstep(w-.03,w+.03,n));c.rgb+=vec3(1.,.45,.1)*exp(-abs(n-w)*40.)*1.5*sin(PI*p);return c;}`, 'Embers', 'جمر'],
    ['xStripes', 'slide', `vec4 tr(vec2 u){float n=8.,k=floor(u.x*n);float dr=mod(k,2.)<.5?1.:-1.;float e=io(clamp(p*1.4-k/n*.4,0.,1.));float y=u.y+dr*e;return (y>=0.&&y<=1.)?TA(vec2(u.x,y)):TB(vec2(u.x,y-dr));}`, 'Stripes up and down', 'شرايط طالعة نازلة'],
    ['xRowsFall', 'slide', `vec4 tr(vec2 u){float n=6.,k=floor(u.y*n);float t=eo(clamp(p*1.5-(n-1.-k)/n*.5,0.,1.));float v=u.y+(1.-t)*(k+1.)/n;return v<(k+1.)/n?TB(vec2(u.x,v)):TA(u);}`, 'Falling rows', 'صفوف نازلة'],
    ['xColsDrop', 'slide', `vec4 tr(vec2 u){float n=10.,k=floor(u.x*n);float t=clamp(p*1.5-h1(vec2(k,3.))*.5,0.,1.);float v=u.y-ei(t)*1.05;return v>=0.?TA(vec2(u.x,v)):TB(u);}`, 'Dropping columns', 'أعمدة بتقع'],
    ['xBounceSlide', 'slide', `vec4 tr(vec2 u){float x=u.x+bk(p*p);return x<1.?TA(vec2(x,u.y)):TB(vec2(x-1.,u.y));}`, 'Bouncy push', 'دفع بارتداد'],
    ['xReveal', 'slide', `vec4 tr(vec2 u){float e=io(p);float x=u.x+e;if(x<=1.)return TA(vec2(x,u.y));vec4 c=TB(u);c.rgb*=1.-.55*(1.-p)*exp(-(u.x-(1.-e))*18.);return c;}`, 'Slide away', 'يتسحب ويكشف'],
    ['xCover', 'slide', `vec4 tr(vec2 u){float t=1.-io(p);if(u.y>t)return TB(vec2(u.x,u.y-t));vec4 c=TA(u);c.rgb*=1.-.55*exp(-(t-u.y)*18.)*step(.001,1.-t);return c;}`, 'Cover up', 'يغطّي من تحت'],
    ['xDoubleSlide', 'slide', `vec4 tr(vec2 u){float dr=u.y<.5?1.:-1.;float x=u.x+dr*io(p);return (x>=0.&&x<=1.)?TA(vec2(x,u.y)):TB(vec2(x-dr,u.y));}`, 'Double push', 'دفع مزدوج'],
    ['xQuadFly', 'slide', `vec4 tr(vec2 u){float e=ei(p);vec2 q=sign(u-.5);vec2 a=u-q*e*.7;if(sign(a-.5)==q&&inb(a))return TA(a);return TB(zm(u,vec2(.5),1.2-.2*eo(p)));}`, 'Four corners', 'أربع أركان'],
    ['xSplitOut', 'slide', `vec4 tr(vec2 u){float e=io(p);if(u.x<.5){float x=u.x+e*.5;if(x<.5)return TA(vec2(x,u.y));}else{float x=u.x-e*.5;if(x>.5)return TA(vec2(x,u.y));}return TB(zm(u,vec2(.5),1.15-.15*e));}`, 'Split open', 'ينفتح نصّين'],
    ['xSliceSlide', 'slide', `vec4 tr(vec2 u){float n=10.,k=floor(u.y*n);float dr=mod(k,2.)<.5?1.:-1.;float e=io(clamp(p*1.4-h1(vec2(k,1.))*.4,0.,1.));float x=u.x+dr*e;return (x>=0.&&x<=1.)?TA(vec2(x,u.y)):TB(vec2(x-dr,u.y));}`, 'Sliding slices', 'شرايح بتتزحلق'],
    ['xDiagSlide', 'slide', `vec4 tr(vec2 u){float e=io(p);vec2 b=u-(1.-e);if(inb(b))return TB(b);return TA(u+e);}`, 'Diagonal push', 'دفع مايل'],
    ['xElastic', 'slide', `float el(float x){return 1.-exp(-4.*x)*cos(x*6.);}
vec4 tr(vec2 u){float x=u.x+el(p*p)/el(1.);return x<1.?TA(vec2(x,u.y)):TB(vec2(x-1.,u.y));}`, 'Rubber push', 'دفع مطّاطي'],
    ['xDropIn', 'slide', `float bn(float x){if(x<.3636)return 7.5625*x*x;if(x<.7273){x-=.5455;return 7.5625*x*x+.75;}if(x<.9091){x-=.8182;return 7.5625*x*x+.9375;}x-=.9545;return 7.5625*x*x+.984375;}
vec4 tr(vec2 u){vec2 b=vec2(u.x,u.y+1.-bn(clamp(p,0.,1.)));if(b.y<=1.)return TB(b);vec4 a=TA(u);a.rgb*=1.-.4*p;return a;}`, 'Drop and bounce', 'يقع وينط'],
    ['xPageTurn', '3d', `vec4 tr(vec2 u){float f=1.-io(p)*1.02;if(u.x>f){vec4 b=TB(u);b.rgb*=1.-.4*(1.-p)*exp(-(u.x-f)*12.);return b;}float m=2.*f-u.x;if(m<=1.){vec4 c=TA(vec2(m,u.y));c.rgb=mix(c.rgb,vec3(.95),.55)*(.75+.25*(f-u.x)/max(1.-f,.01));return c;}return TA(u);}`, 'Page turn', 'تقليب صفحة'],
    ['xFallBack', '3d', `vec4 tr(vec2 u){float a=ei(p)*1.5708;vec3 e2=rx(vec3(0.,1.,0.),a);vec3 A=card(u,vec3(0.,-1.,0.)+e2,vec3(1.,0.,0.),e2);if(A.z>0.){vec4 c=TA(A.xy);c.rgb*=1.-.5*sin(a);return mix(c,TB(u),smoothstep(.75,1.,p));}vec4 b=TB(u);b.rgb*=.55+.45*p;return b;}`, 'Fall back', 'يقع لورا'],
    ['xFlapUp', '3d', `vec4 tr(vec2 u){float a=ei(p)*1.5708;vec3 e2=rx(vec3(0.,1.,0.),-a);vec3 A=card(u,vec3(0.,1.,0.)-e2,vec3(1.,0.,0.),e2);if(A.z>0.){vec4 c=TA(A.xy);c.rgb*=1.-.5*sin(a);return mix(c,TB(u),smoothstep(.75,1.,p));}vec4 b=TB(u);b.rgb*=.55+.45*p;return b;}`, 'Flip up', 'يتقلب لفوق'],
    ['xSwingDoor', '3d', `vec4 tr(vec2 u){float a=ei(p)*1.5708;vec3 e1=ry(vec3(1.,0.,0.),-a);vec3 A=card(u,vec3(-AS(),0.,0.)+e1*AS(),e1,vec3(0.,1.,0.));if(A.z>0.){vec4 c=TA(A.xy);c.rgb*=1.-.45*sin(a);return mix(c,TB(u),smoothstep(.75,1.,p));}vec4 b=TB(u);b.rgb*=.55+.45*p;return b;}`, 'Swing door', 'باب بيتفتح'],
    ['xCarousel', '3d', `vec4 tr(vec2 u){float e=io(p),b=sin(PI*p);float th=e*PI*.5;float rr=AS()*1.8;vec3 C=vec3(0.,0.,rr+b*1.2);
  vec3 qa=C+vec3(sin(-th),0.,-cos(-th))*rr,qb=C+vec3(sin(PI*.5-th),0.,-cos(PI*.5-th))*rr;
  vec3 A=card(u,qa,ry(vec3(1.,0.,0.),th),vec3(0.,1.,0.)),B=card(u,qb,ry(vec3(1.,0.,0.),th-PI*.5),vec3(0.,1.,0.));
  if(A.z>0.&&(B.z<0.||A.z<B.z))return TA(A.xy);if(B.z>0.)return TB(B.xy);return bg(u);}`, 'Carousel', 'دوّارة'],
    ['xTumble', '3d', `vec4 tr(vec2 u){float e=ei(p);vec3 e1=rx(ry(vec3(1.,0.,0.),e*2.2),e*1.3),e2=rx(ry(vec3(0.,1.,0.),e*2.2),e*1.3);vec3 A=card(u,vec3(e*e*5.*AS(),-e*e*2.,e*5.),e1,e2);if(A.z>0.)return TA(A.xy);return TB(zm(u,vec2(.5),1.2-.2*p));}`, 'Tumble away', 'يتشقلب ويطير'],
    ['xZoomFade', 'cam', `vec4 tr(vec2 u){float e=io(p);vec2 v=zm(u,vec2(.5),.55+.45*e);vec4 b=inb(v)?TB(v):vec4(0.);vec4 a=bA(zm(u,vec2(.5),1.+.25*e),.03*e);return mix(a,b,clamp(e*1.6,0.,1.)*b.a);}`, 'Zoom in fade', 'زووم وظهور'],
    ['xZoomSpin', 'cam', `vec4 tr(vec2 u){float e=io(p),b=sin(PI*p);vec2 v=rc(zm(u,vec2(.5),1.+b*1.2),vec2(.5),(e<.5?e:e-1.)*PI);return e<.5?sbA(v,b*.5):sbB(v,b*.5);}`, 'Zoom spin', 'زووم ولفّة'],
    ['xVertigo', 'cam', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 v=zm(u,vec2(.5),1.+b*(1.2-length(sq(u))*2.));return X(v,p);}`, 'Vertigo', 'دوخة'],
    ['xSpin360', 'cam', `vec4 tr(vec2 u){float e=io(p),b=sin(PI*p);vec2 v=rc(zm(u,vec2(.5),1.+b*.8),vec2(.5),e*6.2832);return e<.5?sbA(v,b*.9):sbB(v,b*.9);}`, 'Full spin', 'لفّة كاملة'],
    ['xRollCorner', 'cam', `vec4 tr(vec2 u){float e=io(p);vec2 c=vec2(0.,1.);vec2 b=rc(u,c,-(1.-e)*PI*.5);if(inb(b))return TB(b);vec2 a=rc(u,c,e*PI*.5);if(inb(a))return TA(a);return bg(u);}`, 'Wheel', 'عجلة'],
    ['xFlyAway', 'cam', `vec4 tr(vec2 u){float e=ei(p);float s=max(1.-e,.001);vec2 c=vec2(.5)+vec2(.6,-.6)*e;vec2 a=.5+(rc(u,c,e*.9)-c)/s;if(inb(a))return TA(a);vec4 b=TB(zm(u,vec2(.5),1.15-.15*e));vec2 sh=.5+(rc(u-vec2(.012,-.018)*e,c,e*.9)-c)/s;b.rgb*=inb(sh)?.6:1.;return b;}`, 'Fly away', 'يطير بعيد'],
    ['xPopIn', 'cam', `vec4 tr(vec2 u){vec2 b=.5+(u-.5)/max(bk(clamp(p,0.,1.)),.001);if(inb(b))return TB(b);vec4 a=TA(u);a.rgb*=1.-.5*p;return a;}`, 'Pop in', 'يطلع فجأة'],
    ['xShrinkOut', 'cam', `vec4 tr(vec2 u){float e=ei(p);vec2 a=.5+(rc(u,vec2(.5),e*2.5)-.5)/max(1.-e,.001);if(inb(a))return TA(a);return TB(zm(u,vec2(.5),1.1-.1*e));}`, 'Shrink and spin', 'يصغر ويلف'],
    ['xPunch', 'cam', `vec4 tr(vec2 u){vec4 c=p<.5?TA(zm(u,vec2(.5),1.+.5*ei(p*2.))):TB(zm(u,vec2(.5),1.5-.5*eo(p*2.-1.)));c.rgb+=pow(sin(PI*p),8.)*.8;return c;}`, 'Punch zoom', 'زووم بوكس'],
    ['xPendulum', 'cam', `vec4 tr(vec2 u){float b=sin(PI*p);float ang=sin(p*PI*4.)*(1.-p)*p*2.2;vec2 v=rc(zm(u,vec2(.5),1.+.35*b),vec2(.5,-.3),ang);return X(v,p);}`, 'Pendulum', 'بندول'],
    ['xHandheld', 'cam', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 o=vec2(vn(vec2(p*18.,1.))-.5,vn(vec2(p*18.,9.))-.5)*.12*b;vec2 v=zm(u+o,vec2(.5),1.+.12*b);return p<.5?dbA(v,o*1.5):dbB(v,o*1.5);}`, 'Handheld', 'كاميرا في الإيد'],
    ['xCrash', 'cam', `vec4 tr(vec2 u){if(p<.5){float t=ei(p*2.);return zbA(zm(u,vec2(.5),1.+2.*t),.5*t);}float t=1.-eo(p*2.-1.);return zbB(zm(u,vec2(.5),1.+2.*t),.5*t);}`, 'Crash zoom', 'زووم صاروخ'],
    ['xDolly', 'cam', `vec4 tr(vec2 u){if(p<.5){float t=io(p*2.);return zbA(zm(u,vec2(.5),1.+t),.25*t);}float t=io(p*2.-1.);vec2 v=.5+(u-.5)/(.3+.7*t);if(inb(v))return TB(v);return zbA(zm(u,vec2(.5),2.+t),.3);}`, 'Dolly in', 'دولي لقدّام'],
    ['xTiltShift', 'blur', `vec4 tr(vec2 u){float b=sin(PI*p);float k=pow(abs(u.y-.5)*2.,1.5)*b*.04+b*.004;return mix(bA(u,k),bB(u,k),smoothstep(.35,.65,p));}`, 'Tilt shift', 'تلت شيفت'],
    ['xAnamorphic', 'blur', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 v=vec2(.5+(u.x-.5)/(1.+b*3.),u.y);vec2 d=vec2(.12*b,0.);return p<.5?dbA(v,d):dbB(v,d);}`, 'Wide stretch', 'مطّ عريض'],
    ['xBlurWipe', 'blur', `vec4 tr(vec2 u){float x=u.x-(io(p)*1.5-.25);float k=.04*exp(-x*x*120.);return x<0.?bB(u,k):bA(u,k);}`, 'Blur wipe', 'مسح بلور'],
    ['xGaussDip', 'blur', `vec4 tr(vec2 u){float b=sin(PI*p);float k=.05*b*b;return mix(bA(u,k),bB(u,k),smoothstep(.4,.6,p));}`, 'Deep blur', 'بلور عميق'],
    ['xDatamosh', 'glitch', `vec4 tr(vec2 u){vec2 bl=floor(u*vec2(16.,9.));float r=h1(bl);vec2 off=(vec2(h1(bl+3.),h1(bl+7.))-.5)*.15*sin(PI*p);return r<p*1.2-.1?TB(u+off*.5):TA(u+off);}`, 'Datamosh', 'داتاموش'],
    ['xScan', 'glitch', `vec4 tr(vec2 u){float e=p*1.1-.05;vec4 c=u.y<e?TB(u):TA(u);float d=abs(u.y-e);c.rgb+=vec3(.6,1.,.9)*exp(-d*120.);c.rgb*=1.-.3*step(.5,fract(u.y*R.y*.25))*exp(-d*10.);return c;}`, 'Scan line', 'خط سكان'],
    ['xRgbWipe', 'glitch', `vec4 tr(vec2 u){float e=io(p)*1.32-.01;vec4 a=TA(u),b=TB(u);vec3 m=step(vec3(u.x,u.x+.15,u.x+.3),vec3(e));return vec4(mix(a.rgb,b.rgb,m),mix(a.a,b.a,m.g));}`, 'RGB wipe', 'مسح ألوان'],
    ['xPixelSort', 'glitch', `vec4 tr(vec2 u){float b=sin(PI*p);vec4 c=X(u,p);float l=dot(c.rgb,vec3(.3,.59,.11));float s=step(1.-b*.85,l)*b*.3*h1(vec2(floor(u.x*R.x/3.),floor(p*12.)));return X(vec2(u.x,u.y-s),p);}`, 'Pixel sort', 'فرز بكسلات'],
    ['xTvOff', 'glitch', `vec4 tr(vec2 u){float t=p<.5?p*2.:2.-p*2.;float sy=1.-smoothstep(0.,.6,t)*.992,sx=1.-smoothstep(.55,1.,t)*.99;vec2 v=.5+(u-.5)/vec2(sx,sy);float k=inb(v)?1.:0.;vec4 c=p<.5?TA(v):TB(v);c.rgb=(c.rgb+smoothstep(.3,1.,t)*.9)*k;c.a=1.;return c;}`, 'Old TV off', 'تلفزيون بيقفل'],
    ['xInterlace', 'glitch', `vec4 tr(vec2 u){float l=mod(floor(u.y*R.y/2.),2.);float t=l>.5?smoothstep(.25,.55,p):smoothstep(.45,.75,p);vec2 o=vec2((l-.5)*.06*sin(PI*p),0.);return t>.5?TB(u+o):TA(u+o);}`, 'Interlace', 'سطور متداخلة'],
    ['xBitcrush', 'glitch', `vec4 tr(vec2 u){float b=sin(PI*p);float s=max(b*.07,1./R.y);vec2 bs=vec2(s/AS(),s);vec2 v=b>.05?(floor(u/bs)+.5)*bs:u;vec4 c=mixAB(v,smoothstep(.45,.55,p));float n=mix(64.,3.,b);c.rgb=mix(c.rgb,floor(c.rgb*n+.5)/n,smoothstep(0.,.2,b));return c;}`, 'Bit crush', 'بِت كراش'],
    ['xJpeg', 'glitch', `vec4 tr(vec2 u){vec2 bs=vec2(24./R.x,24./R.y);vec2 c=floor(u/bs);bool on=h1(c)<p;vec4 s=on?TB((c+.5)*bs):TA((c+.5)*bs);vec4 f=on?TB(u):TA(u);return mix(f,s,step(1.-sin(PI*p)*.7,h1(c+floor(p*10.))));}`, 'Broken JPEG', 'جيبج بايظ'],
    ['xRoll', 'glitch', `vec4 tr(vec2 u){float e=io(p),b=sin(PI*p);float v=u.y+e*1.12;vec2 j=vec2((h1(vec2(floor(u.y*60.),floor(p*20.)))-.5)*.03*b,0.);if(v<1.)return TA(vec2(u.x,v)+j);if(v<1.12)return vec4(vec3(h1(u*R+p)*.25),1.);return TB(vec2(u.x,v-1.12)+j);}`, 'Signal roll', 'إشارة بتلف'],
    ['xMatrix', 'glitch', `vec4 tr(vec2 u){float cw=12./R.x;float n=floor(u.x/cw);float hy=p*2.4-h1(vec2(n,5.))*.8;vec4 c=u.y<hy?TB(u):TA(u);float tl=clamp(1.-(hy-u.y)/.35,0.,1.)*step(u.y,hy);
  float ch=step(.45,h1(floor(u*R/vec2(12.,16.))+floor(p*25.)));c.rgb=mix(c.rgb,vec3(.15,1.,.35)*ch*(.5+.5*tl),tl*.85);c.rgb+=vec3(.6,1.,.7)*exp(-abs(u.y-hy)*120.)*ch;return c;}`, 'Code rain', 'مطر كود'],
    ['xTear', 'glitch', `vec4 tr(vec2 u){float b=pow(sin(PI*p),2.);float k=floor(u.y*5.+h1(vec2(floor(p*8.),2.))*3.);vec4 c=X(vec2(u.x+(h1(vec2(k,floor(p*8.)))-.5)*.5*b,u.y),p);c.rgb=mix(c.rgb,c.rgb*vec3(1.2,.8,1.3),b*step(.7,h1(vec2(k,3.))));return c;}`, 'Tear', 'تقطيع'],
    ['xNegFlash', 'glitch', `vec4 tr(vec2 u){vec4 c=X(zm(u,vec2(.5),1.+.08*sin(PI*p)),p);c.rgb=mix(c.rgb,1.-c.rgb,step(.38,p)*step(p,.62));return c;}`, 'Negative flash', 'فلاش نيجاتيف'],
    ['xLed', 'glitch', `vec4 tr(vec2 u){float b=sin(PI*p),w=smoothstep(.4,.6,p);float s=mix(1./R.y,.02,b);vec2 bs=vec2(s/AS(),s);vec2 c=(floor(u/bs)+.5)*bs;vec4 k=mixAB(c,w);float d=length((u-c)/bs);return mix(mixAB(u,w),vec4(k.rgb*step(d,.42),1.),smoothstep(.1,.4,b));}`, 'LED screen', 'شاشة ليد'],
    ['xGlitchZoom', 'glitch', `vec4 tr(vec2 u){float b=max(sin(PI*p),0.);vec2 v=zm(u,vec2(.5),1.+floor(b*6.)/6.*.45);vec2 o=vec2((h1(vec2(floor(p*15.),2.))-.5)*.05*b,0.);return p<.5?rgbA(v,o):rgbB(v,o);}`, 'Glitch zoom', 'زووم جليتش'],
    ['xHueSpin', 'light', `vec3 hr(vec3 c,float a){float Y=dot(c,vec3(.299,.587,.114)),I=dot(c,vec3(.596,-.274,-.322)),Q=dot(c,vec3(.211,-.523,.312));float cs=cos(a),sn=sin(a);vec2 iq=vec2(cs*I-sn*Q,sn*I+cs*Q);
  return vec3(Y+.956*iq.x+.621*iq.y,Y-.272*iq.x-.647*iq.y,Y-1.106*iq.x+1.703*iq.y);}
vec4 tr(vec2 u){vec4 c=mixAB(u,smoothstep(.3,.7,p));c.rgb=hr(c.rgb,p*6.2832);return c;}`, 'Colour spin', 'ألوان بتلف'],
    ['xBloom', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec4 c=mix(bA(u,.03*b),bB(u,.03*b),smoothstep(.45,.55,p));c.rgb+=pow(b,3.)*.7;c.rgb=mix(c.rgb,vec3(1.),pow(b,6.)*.6);return c;}`, 'Bloom', 'نور ناعم'],
    ['xFlare', 'light', `vec4 tr(vec2 u){float x=p*1.6-.3;vec4 c=mixAB(u,smoothstep(.3,.7,p));float st=exp(-abs(u.y-.5)*40.)*exp(-abs(u.x-x)*3.)+exp(-length(sq(u)-vec2((x-.5)*AS(),0.))*8.)*1.5;c.rgb+=vec3(.6,.8,1.)*st*sin(PI*p);return c;}`, 'Lens flare sweep', 'فلير عدسة'],
    ['xSunRays', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 s=sq(u);float rays=pow(.5+.5*sin(atan(s.y,s.x)*14.+p*4.),8.);vec4 c=mixAB(u,smoothstep(.4,.6,p));c.rgb+=vec3(1.,.85,.5)*(rays*(1.-length(s)*.8)+b*.4)*b;return c;}`, 'Sun rays', 'أشعة شمس'],
    ['xNeon', 'light', `float lm(vec2 v,float w){return dot(mixAB(v,w).rgb,vec3(.3,.59,.11));}
vec4 tr(vec2 u){float b=sin(PI*p),w=smoothstep(.4,.6,p);vec2 d=1.5/R;float gx=lm(u+vec2(d.x,0.),w)-lm(u-vec2(d.x,0.),w),gy=lm(u+vec2(0.,d.y),w)-lm(u-vec2(0.,d.y),w);float ed=clamp(length(vec2(gx,gy))*6.,0.,1.);
  vec4 c=mixAB(u,w);c.rgb=mix(c.rgb,c.rgb*.15+mix(vec3(1.,.1,.8),vec3(.1,1.,.9),p)*ed*1.6,smoothstep(.2,.8,b));return c;}`, 'Neon edges', 'حواف نيون'],
    ['xRainbowDip', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec4 c=X(u,p);vec3 g=.5+.5*cos(6.2832*(u.x+p+vec3(0.,.33,.67)));c.rgb=mix(c.rgb,g,smoothstep(.3,1.,b)*.9);return c;}`, 'Rainbow dip', 'قوس قزح'],
    ['xShine', 'light', `vec4 tr(vec2 u){float x=u.x+u.y*.5;float band=exp(-pow((x-(p*2.2-.6))*8.,2.));vec4 c=mixAB(u,smoothstep(.35,.65,p));c.rgb+=band*.9;return c;}`, 'Shine', 'لمعة'],
    ['xExposure', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec4 c=X(u,p);c.rgb=mix(c.rgb,1.-exp(-c.rgb*(1.+7.*b)),smoothstep(0.,.25,b));return c;}`, 'Over exposure', 'تعريض زيادة'],
    ['xRainbowWipe', 'light', `vec4 tr(vec2 u){float x=u.x-(io(p)*1.5-.25);vec4 c=x<-.25?TB(u):x>0.?TA(u):mixAB(u,1.-smoothstep(-.25,0.,x));vec3 rb=.5+.5*cos(6.2832*(x*4.+vec3(0.,.33,.67)));c.rgb=mix(c.rgb,rb,step(-.25,x)*step(x,0.)*.75);return c;}`, 'Rainbow wipe', 'مسح قوس قزح'],
    ['xThermal', 'light', `vec3 heat(float t){return clamp(vec3(1.6*t-.25,2.2*t*t-.2,abs(sin(t*3.1416*1.2))*(1.-t*.6)),0.,1.);}
vec4 tr(vec2 u){float b=sin(PI*p);vec4 c=mixAB(u,smoothstep(.45,.55,p));c.rgb=mix(c.rgb,heat(dot(c.rgb,vec3(.3,.59,.11))),smoothstep(.2,.9,b));return c;}`, 'Thermal', 'كاميرا حرارية'],
    ['xDuotone', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec4 c=mixAB(u,smoothstep(.45,.55,p));c.rgb=mix(c.rgb,mix(vec3(.12,.05,.35),vec3(1.,.45,.6),dot(c.rgb,vec3(.3,.59,.11))),smoothstep(0.,.5,b));return c;}`, 'Duotone flash', 'لونين'],
    ['xLeakSweep', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec4 c=mixAB(u,smoothstep(.35,.65,p));float g=exp(-length(sq(u)-vec2((p*1.6-.8)*AS(),.2-p*.4))*2.5);c.rgb+=mix(vec3(1.,.45,.1),vec3(1.,.2,.5),p)*g*b*1.6;return c;}`, 'Moving light leak', 'تسريب ضوء ماشي'],
    ['xVortex', 'warp', `vec4 tr(vec2 u){float b=sin(PI*p);return mixAB(twirl(u,b*b*b*9.),smoothstep(.4,.6,p));}`, 'Vortex', 'دوامة قوية'],
    ['xSine', 'warp', `vec4 tr(vec2 u){float b=sin(PI*p);return mixAB(u+vec2(sin(u.y*20.+p*10.)*.06*b,0.),smoothstep(.4,.6,p));}`, 'Sine waves', 'موجات'],
    ['xHaze', 'warp', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 v=u+(vec2(fbm(u*6.+p*3.),fbm(u*6.+7.-p*3.))-.5)*.08*b;return mixAB(v,smoothstep(.3,.7,p));}`, 'Heat haze', 'سراب'],
    ['xDripUp', 'warp', `vec4 tr(vec2 u){float t=clamp(p*1.5-vn(vec2(u.x*25.,1.))*.45,0.,1.);float v=u.y+ei(t)*1.15;return v<=1.?TA(vec2(u.x,v)):TB(u);}`, 'Drip up', 'سيحان لفوق'],
    ['xLens', 'warp', `vec4 tr(vec2 u){float cx=p*1.9-.45;vec2 s=sq(u),cp=vec2((cx-.5)*AS(),0.);float d=length(s-cp),r=.32;vec2 v=u;if(d<r)v=(cp+(s-cp)*(.55+.45*d/r))/vec2(AS(),1.)+.5;
  vec4 c=v.x<cx?TB(v):TA(v);c.rgb+=vec3(.8,.9,1.)*exp(-abs(d-r)*120.)*.6;return c;}`, 'Magnifier', 'عدسة مكبّرة'],
    ['xBubblePop', 'warp', `vec4 tr(vec2 u){float b=sin(PI*p);return mixAB(bulge(u,b*b*b*2.5),smoothstep(.45,.55,p));}`, 'Bubble pop', 'فقاعة'],
    ['xTwist', 'warp', `vec4 tr(vec2 u){float a=sin(PI*p)*1.3*(u.y-.5)*2.;float x=.5+(u.x-.5)/max(cos(a),.05);if(x<0.||x>1.)return bg(u);vec4 c=X(vec2(x,u.y),p);c.rgb*=.6+.4*cos(a);return c;}`, 'Twist', 'لفّ'],
    ['xShatter', 'warp', `vec2 sd(vec2 g){return g+vec2(h1(g),h1(g+4.1))*.8+.1;}
vec4 tr(vec2 u){float e=ei(p);vec2 s=sq(u)*4.;vec2 c=floor(s);for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++){vec2 g=c+vec2(float(i),float(j));vec2 o=sd(g);float sc=max(1.-e*.9,.05);
  vec2 q=o+(s-o-normalize(o+vec2(.001))*e*3.)/sc;vec2 qc=floor(q);float md=9.;vec2 mg=vec2(0.);for(int k=-1;k<=1;k++)for(int l=-1;l<=1;l++){vec2 h=qc+vec2(float(k),float(l));float dd=length(q-sd(h));if(dd<md){md=dd;mg=h;}}
  if(mg==g){vec2 a=q/4./vec2(AS(),1.)+.5;if(inb(a))return TA(a)*vec4(vec3(1.-e*.5),1.);}}return TB(zm(u,vec2(.5),1.1-.1*e));}`, 'Shatter', 'تكسير'],
    ['xKaleido', 'warp', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 s=sq(u);float sg=6.2832/(2.+floor(b*6.));float a=abs(mod(atan(s.y,s.x),sg)-sg*.5);vec2 v=mix(u,vec2(cos(a),sin(a))*length(s)/vec2(AS(),1.)+.5,smoothstep(.2,.9,b));return X(v,p);}`, 'Kaleidoscope burst', 'كاليدوسكوب متفجر'],
    ['xMirrorTiles', 'warp', `vec4 tr(vec2 u){float b=sin(PI*p);return X(.5+(u-.5)*(1.+3.*b*b*b),p);}`, 'Mirror tiles', 'مرايات مكررة'],
    ['xSmokeUp', 'warp', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 v=u+vec2(0.,(fbm(u*4.+vec2(0.,p*2.))-.4)*b*.25);vec4 c=mixAB(v,smoothstep(.3,.7,p));c.rgb=mix(c.rgb,vec3(.8),b*.3*fbm(u*3.-vec2(0.,p)));return c;}`, 'Rising smoke', 'دخان طالع'],
    ['xJelly', 'warp', `vec4 tr(vec2 u){float b=sin(PI*p);return mixAB(u+vec2(sin(u.y*10.+p*20.),cos(u.x*8.+p*15.))*.025*b,smoothstep(.4,.6,p));}`, 'Jelly', 'جيلي'],
    ['xFilmSlip', 'film', `vec4 tr(vec2 u){float e=io(p),b=sin(PI*p);float v=u.y+e*1.16;vec2 d=vec2(0.,.06*b);vec4 c;if(v<1.)c=dbA(vec2(u.x,v),d);else if(v<1.16)c=vec4(vec3(.04)+vec3(.7)*step(.6,fract(u.x*8.))*step(abs(v-1.08),.025),1.);else c=dbB(vec2(u.x,v-1.16),d);
  c.rgb*=mix(1.,.85+.15*h1(vec2(floor(p*24.),1.)),b);return c;}`, 'Film slip', 'الفيلم بيفلت'],
    ['xProjector', 'film', `vec4 tr(vec2 u){float b=sin(PI*p),f=floor(p*24.);vec2 j=(vec2(h1(vec2(f,3.)),h1(vec2(f,8.)))-.5)*.02*b;vec4 c=X(u+j,p);c.rgb*=mix(1.,.75+.25*h1(vec2(f,5.)),b);c.rgb*=1.-b*.6*smoothstep(.3,.9,length(sq(u)));return c;}`, 'Projector', 'بروجكتور'],
    ['xPolaroid', 'film', `vec4 tr(vec2 u){float e=ei(p);float s=max(1.-.65*e,.01);vec2 c=vec2(.5,.5+e*.9);vec2 a=.5+(rc(u,c,e*.4)-c)/s;if(inb(a))return TA(a);
  if(e>.001&&a.x>-.05&&a.x<1.05&&a.y>-.05&&a.y<1.18)return vec4(.96,.95,.92,1.);return TB(zm(u,vec2(.5),1.12-.12*e));}`, 'Polaroid', 'صورة بولارويد'],
    ['xSepia', 'film', `vec4 tr(vec2 u){float b=sin(PI*p);vec4 c=mixAB(u,smoothstep(.3,.7,p));vec3 sp=mat3(.393,.349,.272,.769,.686,.534,.189,.168,.131)*c.rgb;c.rgb=mix(c.rgb,sp+(h1(u*R+floor(p*24.))-.5)*.15,b);return c;}`, 'Sepia flash', 'سيبيا'],
    ['xFrameShake', 'film', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 v=zm(u+vec2(0.,sin(p*55.)*.06*b),vec2(.5),1.+.1*b);return p<.5?dbA(v,vec2(0.,.08*b)):dbB(v,vec2(0.,.08*b));}`, 'Frame shake', 'كادر بيترج'],
    ['xHalation', 'film', `vec4 tr(vec2 u){float b=sin(PI*p),w=smoothstep(.4,.6,p);vec4 c=mixAB(u,w);vec4 g=mix(bA(u,.025),bB(u,.025),w);c.rgb+=(vec3(1.,.35,.15)*max(dot(g.rgb,vec3(.3,.59,.11))-.45,0.)*2.2+g.rgb*.3)*b;return c;}`, 'Halation', 'هالة حمرا'],
    ['xVignetteDip', 'film', `vec4 tr(vec2 u){float b=sin(PI*p);float r=1.7-1.8*b*b*b;vec4 c=X(u,p);c.rgb*=1.-smoothstep(r-.3,r,length(sq(u)));return c;}`, 'Vignette dip', 'تعتيم أطراف'],
    // ---- second big batch (y*): patterns and masks
    ['yPuzzle', 'geo', `vec4 tr(vec2 u){vec2 s=u*vec2(6.,4.);vec2 c=floor(s),f=fract(s),o=c;
  if(length(f-vec2(1.,.5))<.2)o=h1(c)>.5?c:c+vec2(1.,0.);if(length(f-vec2(0.,.5))<.2)o=h1(c-vec2(1.,0.))>.5?c-vec2(1.,0.):c;
  if(length(f-vec2(.5,1.))<.2)o=h1(c+9.)>.5?c:c+vec2(0.,1.);if(length(f-vec2(.5,0.))<.2)o=h1(c-vec2(0.,1.)+9.)>.5?c-vec2(0.,1.):c;
  float w=wp(h1(o*1.7+3.),.12);vec2 v=u+vec2(0.,(1.-w)*.03*step(.01,w));vec4 a=w>.01?TB(v):TA(u);vec4 r=mix(TA(u),a,step(.01,w));r.rgb*=1.-.35*w*(1.-w)*4.;return r;}`, 'Puzzle', 'بازل'],
    ['yTruchet', 'geo', `vec4 tr(vec2 u){vec2 s=sq(u)*7.;vec2 c=floor(s),f=fract(s);if(h1(c)>.5)f.x=1.-f.x;
  float m=min(abs(length(f)-.5),abs(length(f-1.)-.5));return wpm(u,m*2.4,.08);}`, 'Truchet arcs', 'أقواس متشابكة'],
    ['yHalfLines', 'geo', `vec4 tr(vec2 u){vec2 q=sq(u);float g=abs(fract((q.x+q.y)*16.)-.5)*2.;vec4 b=TB(u);float d=g*.55+(1.-lu(b))*.45;float w=wp(d,.06);return mix(TA(u),b,w);}`, 'Halftone lines', 'خطوط هافتون'],
    ['yLumaWipe', 'mask', `vec4 tr(vec2 u){vec4 a=TA(u);float w=wp(1.-lu(a),.25);vec4 c=mix(a,TB(u),w);c.rgb+=vec3(1.,.9,.7)*w*(1.-w)*.9;return c;}`, 'Light melts first', 'النور يدوب الأول'],
    ['yHueWipe', 'mask', `float hu(vec3 c){float mx=max(c.r,max(c.g,c.b)),mn=min(c.r,min(c.g,c.b));float d=mx-mn+1e-4;float h=mx==c.r?(c.g-c.b)/d:mx==c.g?2.+(c.b-c.r)/d:4.+(c.r-c.g)/d;return fract(h/6.);}
vec4 tr(vec2 u){vec4 a=TA(u);return wpm(u,hu(a.rgb),.12);}`, 'Colour by colour', 'لون ورا لون'],
    ['yScales', 'geo', `vec4 tr(vec2 u){vec2 s=vec2(u.x*AS()*5.,(1.-u.y)*6.);float r=floor(s.y);s.x+=mod(r,2.)*.5;vec2 f=fract(s);
  float d=(r+length(f-vec2(.5,1.))*.9)/6.6;float w=wp(d,.05);vec4 c=mixAB(u,w);c.rgb*=1.-.3*smoothstep(.35,.5,length(f-vec2(.5,1.)))*w*(1.-w)*4.;return c;}`, 'Fish scales', 'قشر سمك'],
    ['yWeave', 'geo', `vec4 tr(vec2 u){vec2 s=u*vec2(8.*AS()/1.6,8.);vec2 c=floor(s);bool hz=mod(c.x+c.y,2.)<1.;
  float d=hz?u.x*.7+h1(vec2(c.y,1.))*.3:(1.-u.y)*.7+h1(vec2(c.x,2.))*.3;float w=wp(d,.04);vec4 k=mixAB(u,w);
  vec2 f=fract(s);k.rgb*=1.-.25*w*(hz?abs(f.y-.5):abs(f.x-.5))*(1.-p);return k;}`, 'Basket weave', 'نسيج مضفور'],
    ['yClocks', 'geo', `vec4 tr(vec2 u){vec2 s=sq(u)*vec2(3.,3.)+vec2(2.4,1.5);vec2 c=floor(s),f=fract(s)-.5;
  float a=(atan(f.x,f.y)+PI)/6.2832;float t=length(c-vec2(2.,1.))/2.5;return wpm(u,clamp(t,0.,1.)*.45+a*.55,.02);}`, 'Little clocks', 'ساعات صغيرة'],
    ['yBarcode', 'mask', `vec4 tr(vec2 u){float d=h1(vec2(floor(u.x*48.),0.))*.45+h1(vec2(floor(u.x*9.),5.))*.55;float w=wp(d,.01);vec4 c=mix(TA(u+vec2(0.,w*0.)),TB(u),w);
  float edge=step(.0,w)*step(w,.99)*step(.01,w);c.rgb=mix(c.rgb,vec3(0.),edge*.8);return c;}`, 'Barcode', 'باركود'],
    ['yXCross', 'shape', `vec4 tr(vec2 u){vec2 q=sq(u);float d=min(abs(q.x-q.y),abs(q.x+q.y));return wpm(u,d*1.25,.03);}`, 'X cross', 'علامة X'],
    ['yTriIris', 'shape', `float st(vec2 q){float k=1.732;q.x=abs(q.x)-1.;q.y=q.y+1./k;if(q.x+k*q.y>0.)q=vec2(q.x-k*q.y,-k*q.x-q.y)/2.;q.x-=clamp(q.x,-2.,0.);return -length(q)*sign(q.y);}
vec4 tr(vec2 u){float e=io(p),r=e*2.6;if(r<.001)return TA(u);float d=st(rot(sq(u),e*2.1)/r)*r;vec4 c=X(u,step(d,0.));c.rgb+=vec3(1.)*smoothstep(.02,0.,abs(d))*sin(PI*p);return c;}`, 'Triangle iris', 'مثلث بيفتح'],
    ['yKeyhole', 'shape', `vec4 tr(vec2 u){float s=ei(p)*7.;if(s<.001)return TA(u);vec2 q=sq(u)/s;bool k=length(q-vec2(0.,.12))<.25||(q.y<.12&&q.y>-.45&&abs(q.x)<.07+(.12-q.y)*.25);
  vec4 c=k?TB(zm(u,vec2(.5),1.+.2*(1.-p))):TA(u);if(!k)c.rgb*=1.-.4*sin(PI*p);return c;}`, 'Keyhole', 'خرم الباب'],
    ['yEyeOpen', 'shape', `vec4 tr(vec2 u){vec2 q=sq(u);float e=io(p);float x=q.x/1.6;float h=e*1.25*(1.-x*x);float d=abs(q.y)-h;
  vec4 c=d<0.?bB(u,.03*(1.-e)):TA(u)*vec4(vec3(1.-.6*sin(PI*p)),1.);c.rgb*=smoothstep(0.,.03,abs(d))*.6+.4;return mix(c,TB(u),smoothstep(.85,1.,p));}`, 'Eye opens', 'عين بتفتح'],
    ['yCurtains', 'shape', `vec4 tr(vec2 u){float e=io(p);float h=.5*(1.-e);float x=u.x<.5?u.x:1.-u.x;if(x>h)return TB(u);
  float t=x/max(h,1e-4)*.5;vec2 v=vec2(u.x<.5?t:1.-t,u.y);vec4 c=TA(v);c.rgb*=mix(1.,.75+.25*cos(x*90.*(1.+e*2.)),smoothstep(0.,.25,p));return c;}`, 'Stage curtains', 'ستارة مسرح'],
    ['yMetaballs', 'mask', `vec4 tr(vec2 u){vec2 q=sq(u);float f=0.;for(int i=0;i<7;i++){float k=float(i);vec2 c=vec2(sin(k*2.1+p*3.)*.6,cos(k*1.7+p*2.)*.35);f+=.012/(dot(q-c,q-c)+1e-3);}
  float w=smoothstep(.9,1.1,f*p*p*p*70.);vec4 c=mixAB(u,w);c.rgb+=vec3(.5,.8,1.)*w*(1.-w)*1.2;return c;}`, 'Blobs', 'نقط بتلزق في بعض'],
    ['yBurnHoles', 'mask', `vec4 tr(vec2 u){vec2 s=sq(u)*5.;vec2 c=floor(s);float v=-9.;for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++){vec2 g=c+vec2(float(i),float(j));
  vec2 o=g+vec2(h1(g),h1(g+5.));float b=h1(g+11.)*.55;v=max(v,(p-b)*3.4-length(s-o));}
  if(v>0.)return TB(u);vec4 a=TA(u);float rim=smoothstep(-.12,0.,v);a.rgb=mix(a.rgb*(1.-rim*.8),vec3(1.,.55,.1),smoothstep(-.04,0.,v)*step(.001,p));return a;}`, 'Burn holes', 'خروم محروقة'],
    ['yScratchOff', 'mask', `vec4 tr(vec2 u){float k=(u.x+u.y*.35)*13.+vn(u*vec2(3.,30.))*.6;float d=h1(vec2(floor(k),2.));float w=wp(d,.04);
  vec4 a=TA(u);a.rgb=mix(a.rgb,vec3(.75,.76,.8),.25*sin(PI*p));vec4 c=mix(a,TB(u),w);c.rgb+=.25*step(.5,w)*step(w,.9)*h1(u*R);return c;}`, 'Scratch card', 'كارت كشط'],
    ['yTypewriter', 'mask', `vec4 tr(vec2 u){float r=floor((1.-u.y)*9.),cc=floor(u.x*20.);float d=(r+cc/20.)/9.;float w=step(d,p*1.0001-.0001);
  float cur=step(abs((r+cc/20.)/9.-p),.0055)*step(.001,p)*step(p,.999);vec4 c=X(u,w);return mix(c,vec4(1.,1.,1.,1.),cur*.85);}`, 'Typewriter', 'آلة كاتبة'],
    ['yProgressive', 'mask', `vec4 tr(vec2 u){float l=p*4.,n=floor(l),f=fract(l);float lev=(1.-u.y)<f?n:n-1.;if(lev<0.)return TA(u);if(lev>2.5)return TB(u);
  float r=pow(2.,3.+lev*2.);vec2 g=vec2(r*AS(),r);vec4 c=TB((floor(u*g)+.5)/g);c.rgb+=vec3(.2)*step(abs((1.-u.y)-f),.004);return c;}`, 'Slow loading', 'تحميل بطيء'],
    ['ySnake', 'geo', `vec4 tr(vec2 u){vec2 s=vec2(u.x*10.,u.y*6.);vec2 c=floor(s),f=fract(s);float i=c.y*10.+(mod(c.y,2.)<1.?c.x:9.-c.x);float t=clamp((p*61.-i),0.,1.);
  if(t<=0.)return TA(u);vec2 k=(f-.5)/max(eo(t),.01)+.5;if(!inb(k))return TA(u);vec4 b=TB((c+k)/vec2(10.,6.));if(t<1.)b.rgb+=.3*(1.-t);return b;}`, 'Snake', 'التعبان'],
    ['ySpiralBlocks', 'geo', `vec4 tr(vec2 u){vec2 s=vec2(u.x*10.,u.y*6.);vec2 c=floor(s);float k=min(min(c.x,c.y),min(9.-c.x,5.-c.y));vec2 q=c+.5-vec2(5.,3.);
  float a=fract((atan(q.y,-q.x)+PI)/6.2832+.25);float d=(k+a)/3.;return wpm(u,d,.015);}`, 'Square spiral', 'حلزونة مربعات'],
    ['yComb', 'mask', `vec4 tr(vec2 u){float n=floor(u.x*16.),f=fract(u.x*16.);bool up=mod(n,2.)<1.;float y=up?1.-u.y:u.y;
  float tip=.5-sqrt(max(.25-(f-.5)*(f-.5),0.));float d=y*.85+h1(vec2(n,7.))*.15+tip*.06;return wpm(u,d,.01);}`, 'Comb', 'مشط'],
    ['ySunrise', 'light', `vec4 tr(vec2 u){vec2 q=sq(u);float e=io(p);vec2 c=vec2(0.,-.55);float r=e*1.65;float d=length(q-c);
  vec4 a=TA(u);float ray=pow(max(cos(atan(q.y-c.y,q.x-c.x)*14.),0.),6.)*sin(PI*p);a.rgb+=vec3(1.,.7,.3)*ray*.35*smoothstep(1.4,0.,d);
  vec4 o=d<r?TB(u):a;o.rgb+=vec3(1.,.8,.4)*smoothstep(.06,0.,abs(d-r))*sin(PI*p);return o;}`, 'Sunrise', 'شروق'],
    ['yRadar', 'light', `vec4 tr(vec2 u){vec2 q=sq(u);float a=(atan(q.x,q.y)+PI)/6.2832;float t=p*3.;float lay=clamp(floor(t-a+1.)/3.,0.,1.);
  if(p>.999)lay=1.;vec4 c=mixAB(u,lay);float tr2=fract(t-a);c.rgb=mix(c.rgb,c.rgb*vec3(.3,1.,.4),.8*exp(-tr2*5.)*sin(PI*p));c.rgb+=vec3(.6,1.,.6)*exp(-tr2*300.)*sin(PI*p);return c;}`, 'Radar sweeps', 'رادار'],
    ['yDoubleIris', 'shape', `vec4 tr(vec2 u){vec2 q=sq(u);float r=ei(p)*2.;float a=length(q-vec2(-.5,0.)),b=length(q-vec2(.5,0.));
  vec4 c=X(u,step(min(a,b),r));if(a<r&&b<r)c.rgb+=vec3(.25,.2,.1)*sin(PI*p);return c;}`, 'Twin circles', 'دايرتين'],
    // ---- light and colour
    ['yCaustics', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 q=u*6.+vec2(p*2.,p);float c=0.;for(int i=0;i<3;i++){float k=float(i)+1.;c+=abs(sin(q.x*k+sin(q.y*k*1.3+p*5.)))*.33;}
  float l=pow(1.-c,5.)*b*3.;vec2 v=u+vec2(sin(q.y),cos(q.x))*.01*b;vec4 o=mixAB(v,smoothstep(.35,.65,p));o.rgb+=vec3(.6,.9,1.)*l;o.rgb=mix(o.rgb,o.rgb*vec3(.7,.9,1.),b*.4);return o;}`, 'Pool light', 'نور حمام سباحة'],
    ['yDisco', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 q=rot(sq(u),p*3.)*9.;vec2 c=fract(q)-.5;float h=h1(floor(q));float s=smoothstep(.18,.0,length(c))*step(.6,h);
  vec4 o=mixAB(u,smoothstep(.4,.6,p));o.rgb*=1.-.55*b;o.rgb+=vec3(.5+.5*sin(h*20.),.5+.5*sin(h*30.+2.),.5+.5*sin(h*40.+4.))*s*b*1.5;return o;}`, 'Disco ball', 'كورة ديسكو'],
    ['yPolice', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);float f=floor(p*10.);vec3 col=mod(f,2.)<1.?vec3(1.,.1,.15):vec3(.1,.3,1.);float side=mod(f,2.)<1.?1.-u.x:u.x;
  vec4 o=X(u,p);o.rgb=mix(o.rgb,o.rgb*.4+col*side*.9,b*.75);return o;}`, 'Police lights', 'نور بوليس'],
    ['yFireworks', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 q=sq(u);vec4 o=mixAB(u,smoothstep(.45,.6,p));o.rgb*=1.-.6*b;
  for(int i=0;i<4;i++){float k=float(i);float t=fract(p*1.6+k*.27);vec2 c=vec2(h1(vec2(k,1.))-.5,h1(vec2(k,2.))*.5-.1)*vec2(AS(),1.);vec2 d=q-c;float a=atan(d.y,d.x);
  float sp=pow(max(cos(a*12.),0.),30.);float r=t*.45;o.rgb+=vec3(.5+.5*sin(k*2.),.5+.5*sin(k*3.+1.),.6)*sp*smoothstep(.03,0.,abs(length(d)-r))*(1.-t)*b*3.;}return o;}`, 'Fireworks', 'صواريخ'],
    ['yGlitter', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 g=floor(u*R/3.);float s=h1(g+floor(p*20.));float sp=step(.985-b*.08,s);vec4 o=mixAB(u,smoothstep(.3,.7,p));
  o.rgb+=vec3(1.,.9,.6)*sp*b*1.6;o.rgb+=vec3(.15,.1,0.)*b;return o;}`, 'Glitter', 'ترتر'],
    ['yNightVision', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec4 o=X(u+vec2(0.,(h1(vec2(floor(p*30.),u.y*80.))-.5)*.004*b),p);float l=lu(o);
  vec3 g=vec3(.2,1.,.3)*(l*1.6+(h1(u*R+p)-.5)*.3)*(1.-.5*smoothstep(.5,.9,length(sq(u))));o.rgb=mix(o.rgb,g,smoothstep(.15,.7,b));return o;}`, 'Night vision', 'رؤية ليلية'],
    ['yGreyDip', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec4 o=mixAB(u,smoothstep(.35,.65,p));float l=lu(o);o.rgb=mix(o.rgb,vec3(l),smoothstep(0.,.6,b));o.rgb=mix(o.rgb,vec3(.5),b*b*.5);return o;}`, 'Grey dip', 'رمادي'],
    ['yThreshold', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec4 o=X(u,p);float l=lu(o);float th=.5+.3*sin(p*9.);vec3 bw=vec3(step(th,l));o.rgb=mix(o.rgb,bw,smoothstep(.25,.8,b));return o;}`, 'Black and white cut', 'أبيض وأسود حاد'],
    ['ySolarDip', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec4 o=mixAB(u,smoothstep(.4,.6,p));vec3 s=abs(o.rgb-vec3(.5))*2.;s=vec3(s.r,s.b*.8,s.g);o.rgb=mix(o.rgb,1.-s,b*b);return o;}`, 'Solarize', 'تشميس'],
    ['yChanStagger', 'light', `vec4 tr(vec2 u){float r=smoothstep(0.,.6,p),g=smoothstep(.2,.8,p),bl=smoothstep(.4,1.,p);vec4 a=TA(u),c=TB(u);return vec4(mix(a.r,c.r,r),mix(a.g,c.g,g),mix(a.b,c.b,bl),1.);}`, 'Red, green, blue', 'أحمر أخضر أزرق'],
    ['ySunset', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec4 o=mixAB(u,smoothstep(.4,.6,p));vec3 sky=mix(vec3(1.,.45,.1),vec3(.35,.1,.45),u.y);o.rgb=mix(o.rgb,o.rgb*sky*1.7,b*.85);o.rgb*=1.-b*.3*(1.-u.y);return o;}`, 'Sunset', 'غروب'],
    ['yLighthouse', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 q=sq(u)-vec2(-.9,.0);float a=atan(q.y,q.x)-(p*2.-.5)*2.4;float beam=smoothstep(.25,0.,abs(sin(a)))*step(0.,cos(a));
  vec4 o=X(u,p);o.rgb*=1.-.6*b;o.rgb+=vec3(1.,.95,.75)*beam*b*.9/(1.+length(q)*.6);return o;}`, 'Lighthouse beam', 'منارة'],
    ['yCandle', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);float fl=.7+.3*vn(vec2(p*30.,1.));vec2 q=sq(u)-vec2(0.,-.35);float g=exp(-dot(q,q)*3.)*fl;
  vec4 o=mixAB(u,smoothstep(.35,.65,p));o.rgb=mix(o.rgb,o.rgb*vec3(1.,.6,.3)*g*1.8,b);return o;}`, 'Candle light', 'نور شمعة'],
    // ---- stylised glitch
    ['yAscii', 'glitch', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 g=vec2(R.x/8.,R.y/12.);vec2 c=floor(u*g),f=fract(u*g);vec4 o=X((c+.5)/g,p);float l=lu(o);
  float ch=l<.2?0.:l<.4?step(abs(f.y-.5),.08):l<.6?step(abs(f.x-.5),.1)+step(abs(f.y-.5),.08):l<.8?step(abs(f.x-f.y),.12)+step(abs(f.x+f.y-1.),.12):step(.15,min(f.x,min(f.y,min(1.-f.x,1.-f.y))));
  vec3 t=vec3(.3,1.,.4)*clamp(ch,0.,1.);return mix(X(u,p),vec4(t,1.),smoothstep(.25,.8,b));}`, 'Text art', 'حروف كمبيوتر'],
    ['yHalftoneDip', 'glitch', `vec4 tr(vec2 u){float b=sin(PI*p);float n=mix(220.,26.,b);vec2 q=rot(u*vec2(AS(),1.),.6)*n;vec2 c=fract(q)-.5;vec2 cc=rot((floor(q)+.5)/n,-.6)/vec2(AS(),1.);
  vec4 o=X(cc,p);float r=sqrt(1.-lu(o))*.6;vec3 dt=vec3(1.-smoothstep(r-.08,r,length(c)));vec3 ink=mix(vec3(.97,.95,.9),o.rgb*.4,1.-dt);return mix(X(u,p),vec4(ink,1.),smoothstep(.25,.8,b));}`, 'Newspaper dots', 'نقط جرنال'],
    ['yDither', 'glitch', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 g=floor(u*R/mix(1.,4.,b));float m=mod(g.x,4.),n=mod(g.y,4.);
  float t=(mod(m+n*2.,4.)*4.+mod(m*2.+n,4.))/16.;vec4 o=X(u,p);vec3 d=step(vec3(t),o.rgb);return mix(o,vec4(d,1.),smoothstep(.25,.8,b));}`, 'Dither', 'نقط بكسل قديم'],
    ['yRgbSpin', 'glitch', `vec4 tr(vec2 u){float b=sin(PI*p);vec4 c=X(u,p);float r=X(rc(u,vec2(.5),b*.3),p).r,bl=X(rc(u,vec2(.5),-b*.3),p).b;return vec4(r,c.g,bl,1.);}`, 'Colour spin', 'ألوان بتلف'],
    ['yRowsWeave', 'glitch', `vec4 tr(vec2 u){float b=sin(PI*p);float r=floor(u.y*24.);float s=(mod(r,2.)<1.?1.:-1.)*b*b*.5;vec2 v=vec2(u.x+s,u.y);float w=smoothstep(.4,.6,p+.08*(h1(vec2(r,1.))-.5));return mixAB(v,w);}`, 'Rows weave', 'سطور رايحة جاية'],
    ['yMosaicShuffle', 'glitch', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 g=vec2(8.,5.);vec2 c=floor(u*g),f=fract(u*g);float k=floor(b*5.);vec2 o=floor(vec2(h1(c+k),h1(c+k+3.))*g);
  vec2 s=mix(c,o,step(1.-b*.6,h1(c*1.3+k)));return X((s+f)/g,p);}`, 'Shuffled tiles', 'مربعات متلخبطة'],
    ['yTileSpin', 'glitch', `vec4 tr(vec2 u){vec2 g=vec2(8.,5.);vec2 c=floor(u*g),f=fract(u*g)-.5;float t=clamp(p*1.6-h1(c)*.6,0.,1.);float a=io(t)*PI;
  float sx=cos(a);if(abs(f.x)>abs(sx)*.5)return vec4(0.,0.,0.,1.);vec2 l=vec2(f.x/max(abs(sx),1e-3),f.y)+.5;vec4 o=a<PI*.5?TA((c+l)/g):TB((c+l)/g);o.rgb*=.6+.4*abs(sx);return o;}`, 'Tiles flip over', 'مربعات بتتقلب'],
    ['yRowRepeat', 'glitch', `vec4 tr(vec2 u){float b=sin(PI*p);float r=floor(u.y*40.);float hold=step(.75-b*.5,h1(vec2(r,floor(p*15.))));float y=hold>.5?(floor(u.y*6.)+.5)/6.:u.y;return X(vec2(u.x,mix(u.y,y,step(.05,b))),p);}`, 'Stuck rows', 'سطور معلقة'],
    ['yMoire', 'glitch', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 q=sq(u);float m=sin(length(q-vec2(.2,0.))*180.)*sin(length(q+vec2(.2,0.))*180.+p*20.);vec4 o=mixAB(u,smoothstep(.4,.6,p));o.rgb*=1.-b*.55*(m*.5+.5);return o;}`, 'Moire', 'تموج خطوط'],
    ['yHologram', 'glitch', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 v=u+vec2((h1(vec2(floor(u.y*60.),floor(p*20.)))-.5)*.03*b,0.);vec4 o=mixAB(v,smoothstep(.35,.65,p));float l=lu(o);
  vec3 h=vec3(.3,.85,1.)*l*1.3*(.8+.2*sin(u.y*400.+p*50.));o.rgb=mix(o.rgb,h,b*.85);return o;}`, 'Hologram', 'هولوجرام'],
    ['ySlats', 'glitch', `vec4 tr(vec2 u){float n=12.;float c=floor(u.x*n);float t=clamp((p-c/n*.5)*2.,0.,1.);float y=u.y+eo(t)*(mod(c,2.)<1.?1.:-1.);
  if(y>1.||y<0.)return TB(u);vec4 o=TA(vec2(u.x,y));o.rgb*=1.-.3*t;return o;}`, 'Slats slide off', 'شرايح بتزحلق'],
    // ---- 3D, warps and moves
    ['yBook', '3d', `vec4 tr(vec2 u){float a=io(p)*PI,h=AS();vec3 C=vec3(0.,0.,-2.4);vec3 r=vec3((u-.5)*2.*vec2(h,1.),2.4);vec3 e1=ry(vec3(1.,0.,0.),a);vec3 n=cross(e1,vec3(0.,1.,0.));
  float dn=dot(r,n);if(abs(dn)>1e-5){float t=dot(-C,n)/dn;vec3 P=C+t*r;float x=dot(P,e1);if(t>0.&&x>=0.&&x<=h&&abs(P.y)<=1.){float y=P.y*.5+.5;float l=.6+.4*abs(cos(a));
  vec4 c=a<PI*.5?TA(vec2(.5+x/(2.*h),y)):TB(vec2(.5-x/(2.*h),y));c.rgb*=l;return c;}}return u.x<.5?TA(u):TB(u);}`, 'Book page', 'صفحة كتاب'],
    ['yCylinder', '3d', `vec4 tr(vec2 u){float b=sin(PI*p),k=smoothstep(.1,.7,b);float z=1.-.3*k;vec2 v=.5+(u-.5)/z;if(!inb(v))return bg(u);
  float x=v.x*2.-1.;float th=mix(x*PI*.5,asin(clamp(x,-1.,1.)),k);float ph=th+io(p)*PI;vec4 c=ph<PI*.5?TA(vec2(.5+ph/PI,v.y)):TB(vec2(.5+(ph-PI)/PI,v.y));
  c.rgb*=mix(1.,.35+.65*cos(th),k);return c;}`, 'Turning drum', 'أسطوانة بتلف'],
    ['ySphere', '3d', `vec4 tr(vec2 u){float b=sin(PI*p);float k=smoothstep(.15,.8,b);float r=mix(1.2,.42,k);vec2 q=sq(u);float d=length(q);if(d>r)return bg(u);
  vec3 n=vec3(q,-sqrt(r*r-d*d))/r;float lon=atan(n.x,-n.z)+(p-.5)*PI*2.;float lat=asin(clamp(n.y,-1.,1.));vec2 s=vec2(.5+lon/PI,.5+lat/PI);
  vec4 c=X(mix(u,s,k),p);c.rgb*=mix(1.,.35+.65*-n.z,k);return c;}`, 'Globe', 'كورة أرضية'],
    ['yCubeInside', '3d', `vec4 tr(vec2 u){float a=io(p)*PI*.5,h=AS();vec3 d=ry(vec3((u.x-.5)*2.*h,(u.y-.5)*2.,h),a);float t1=d.z>1e-4?h/d.z:1e9,t2=d.x>1e-4?h/d.x:1e9;vec3 P=d*min(t1,t2);
  if(abs(P.y)>1.)return vec4(vec3(.05),1.);vec4 c=t1<t2?TA(vec2(P.x/h*.5+.5,P.y*.5+.5)):TB(vec2(.5-P.z/h*.5,P.y*.5+.5));c.rgb*=mix(1.,clamp(1.5-length(P)/(h*1.4),.45,1.),sin(PI*p));return c;}`, 'Inside the box', 'جوه الصندوق'],
    ['yCardDeal', 'slide', `vec4 tr(vec2 u){float e=eo(p);vec2 c=mix(vec2(1.7,-.6),vec2(.5),e);float an=(1.-e)*5.;float s=mix(.5,1.,e);vec2 a=.5+(rc(u,c,-an)-c)/s;if(inb(a))return TB(a);
  vec2 sh=.5+(rc(u-vec2(.02,-.03)*(1.-e),c,-an)-c)/s;vec4 o=TA(u);if(inb(sh))o.rgb*=.55;return o;}`, 'Card dealt', 'كارت بيترمي'],
    ['yStack', 'slide', `vec4 tr(vec2 u){float b=sin(PI*p);b=b*b*(3.-2.*b);float s=1.-.35*b;vec2 pa=vec2(.5-.42*b,.5),pb=vec2(.5+.42*b,.5);vec2 a=.5+rc(u-pa+.5,vec2(.5),.15*b)/s-.5/s,c=.5+rc(u-pb+.5,vec2(.5),-.15*b)/s-.5/s;
  bool ia=inb(a),ib=inb(c);vec4 o=bg(u);if(p<.5){if(ib)o=TB(c);if(ia)o=TA(a);}else{if(ia)o=TA(a);if(ib)o=TB(c);}return o;}`, 'Card shuffle', 'خلط كوتشينة'],
    ['yReels', '3d', `vec4 tr(vec2 u){float c=floor(u.x*5.);float t=clamp(p*1.5-c*.125,0.,1.);float a=io(t)*PI*.5;float Y=u.y-.5;float ca=cos(a),sa=sin(a);
  float ya=(Y-.5*sa)/max(ca,1e-4),yb=(Y+.5*ca)/max(sa,1e-4);if(ca>1e-3&&abs(ya)<=.5){vec4 o=TA(vec2(u.x,ya+.5));o.rgb*=.4+.6*ca;return o;}
  vec4 o=TB(vec2(u.x,yb+.5));o.rgb*=.4+.6*sa;o.rgb*=1.-.6*step(fract(u.x*5.),.008)*sin(PI*p);return o;}`, 'Slot reels', 'بكرات سلوت'],
    ['ySplitFlap', '3d', `vec4 tr(vec2 u){vec2 g=vec2(10.,6.);vec2 c=floor(u*g),f=fract(u*g);float t=clamp(p*1.7-h1(c)*.7,0.,1.);float ca=cos(t*PI);vec2 tc=f;bool B=false;float sh=1.;
  if(f.y>=.5){if(ca>0.&&f.y-.5<.5*ca){tc=vec2(f.x,.5+(f.y-.5)/ca);sh=.5+.5*ca;}else B=t>0.;}
  else if(ca<0.&&.5-f.y<-.5*ca){tc=vec2(f.x,.5-(.5-f.y)/(-ca));B=true;sh=.5-.5*ca;}
  vec4 o=B?TB((c+tc)/g):TA((c+tc)/g);o.rgb*=sh;o.rgb*=1.-.5*step(abs(f.y-.5),.02)*sin(PI*p);return o;}`, 'Airport board', 'لوحة مطار'],
    ['yAccordion', 'warp', `vec4 tr(vec2 u){float e=io(p),w=1.-e;bool a=u.x<w;float x=a?u.x/max(w,1e-4):(u.x-w)/max(1.-w,1e-4);float k=a?1.-w:w;
  float f=fract(x*10.);float sy=1.-k*.14*abs(f*2.-1.);vec2 v=vec2(x,.5+(u.y-.5)/sy);if(v.y<0.||v.y>1.)return bg(u);vec4 o=a?TA(v):TB(v);o.rgb*=1.-k*(.45*step(.5,f)+.2*f);return o;}`, 'Accordion', 'أكورديون'],
    ['yTornado', 'warp', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 q=u-.5;q.x/=mix(1.,.2+u.y*1.1,b);q.x+=sin(u.y*9.-p*25.)*.08*b;vec2 v=q+.5;v.y+=b*.12*(1.-u.y);
  vec4 o=mixAB(v,smoothstep(.4,.6,p));o.rgb=mix(o.rgb,vec3(.35,.37,.4)*(.6+.4*fbm(u*5.+p)),smoothstep(.5,.7,abs(q.x))*b);return o;}`, 'Tornado', 'إعصار'],
    ['yBlackHole', 'warp', `vec4 tr(vec2 u){float b=sin(PI*p);b=b*b*b;vec2 q=sq(u);float d=length(q);float hr=.18*b;vec2 s=rot(q,b*2./(d+.15))*(1.+b*.6/(d+.1));vec4 o=X(s/vec2(AS(),1.)+.5,p);
  o.rgb*=1.-(1.-smoothstep(hr,hr+.05,d))*min(b*20.,1.);o.rgb+=vec3(1.,.6,.25)*exp(-pow((d-hr*1.6)*25.,2.))*b;return o;}`, 'Black hole', 'ثقب أسود'],
    ['yShockwave', 'warp', `vec4 tr(vec2 u){vec2 q=sq(u);float e=io(p);float r=e*1.25;float d=length(q);float w=exp(-pow((d-r)*14.,2.))*sin(PI*p);vec2 n=normalize(q+1e-4)/vec2(AS(),1.);vec2 v=u-n*w*.14;
  vec4 o=X(v,step(d,r));o.r=X(v-n*w*.02,step(d,r)).r;o.b=X(v+n*w*.02,step(d,r)).b;o.rgb+=w*.25;return o;}`, 'Shock wave', 'موجة صدمة'],
    ['yShearSlide', 'slide', `vec4 tr(vec2 u){float e=io(p),b=sin(PI*p);float x=u.x+e+(u.y-.5)*b*.5;vec2 d=vec2(b*.08,0.);return x<1.?dbA(vec2(x,u.y),d):dbB(vec2(x-1.,u.y),d);}`, 'Slanted push', 'زقة مايلة'],
    ['yNested', 'cam', `vec4 tr(vec2 u){float e=io(p);vec2 q=sq(u)*pow(2.,-e*4.);float m=max(abs(q.x)/(AS()*.5),abs(q.y)/.5);float L=max(floor(-log2(max(m,1e-6))),0.);bool isB=L>=4.;L=min(L,4.);
  vec2 lc=q*pow(2.,L);vec2 a=lc/vec2(AS(),1.)+.5;vec4 o=isB?TB(a):TA(a);float fr=max(abs(lc.x)/(AS()*.5),abs(lc.y)/.5);o.rgb*=1.-.7*smoothstep(.95,1.,fr)*step(.5,L)*step(e,.999);
  return mix(TA(u),o,smoothstep(0.,.12,p));}`, 'Picture in picture', 'صورة جوه صورة'],
    ['yMirrorSweep', 'warp', `vec4 tr(vec2 u){float m=1.-io(p);if(u.x<m)return TA(u);vec4 o=TB(vec2(2.*m-u.x,u.y));o.rgb*=1.-.3*exp(-(u.x-m)*30.)*sin(PI*p);return o;}`, 'Mirror sweep', 'مراية ماشية'],
    ['yRollUp', '3d', `vec4 tr(vec2 u){float r=.07;float e=io(p);float yc=-r+e*(1.+2.*r);if(u.y<yc-r){vec4 o=TB(u);o.rgb*=1.-.4*exp(-(yc-r-u.y)*20.)*(1.-p);return o;}float dy=u.y-yc;
  if(abs(dy)<r){float an=asin(dy/r);vec4 o=TA(vec2(u.x,yc-r*an));o.rgb*=.45+.55*cos(an);return o;}return TA(u);}`, 'Poster rolls up', 'بوستر بيتلف'],
    ['yZipper', 'slide', `vec4 tr(vec2 u){float e=io(p);float y0=1.-e*1.35;float g=max(u.y-y0,0.)*2.;float dx=u.x-.5;if(abs(dx)<g){vec4 o=TB(u);o.rgb*=1.-.4*exp(-(g-abs(dx))*40.)*(1.-p);return o;}
  vec4 o=TA(vec2(u.x-sign(dx)*g,u.y));if(g>0.&&abs(abs(dx)-g)<.012)o.rgb=mix(o.rgb,vec3(.75,.7,.55),step(.5,fract(u.y*60.+step(0.,dx)*.5)));return o;}`, 'Zipper', 'سوستة'],
    ['yElevator', 'slide', `vec4 tr(vec2 u){float c=sin(PI*p);c=c*c*(3.-2.*c);float l=.5*c;vec4 o=X(u,p);if(u.x<l||u.x>1.-l){float dl=u.x<l?u.x-l:u.x-(1.-l);
  vec3 m=vec3(.55,.57,.6)+.08*vn(vec2(dl*300.,u.y*4.))+.1*u.y;m*=.6+.4*smoothstep(0.,.012,abs(dl));return vec4(m,1.);}o.rgb*=1.-.4*c;return o;}`, 'Elevator doors', 'باب أسانسير'],
    ['yParallax', 'slide', `vec4 tr(vec2 u){float e=io(p),b=sin(PI*p);float x=u.x+e;if(x<1.)return TA(vec2(x+b*.1*(lu(TA(vec2(x,u.y)))-.5),u.y));
  return TB(vec2(x-1.+b*.1*(lu(TB(vec2(x-1.,u.y)))-.5),u.y));}`, 'Depth push', 'زقة بعمق'],
    ['yFeed', 'slide', `vec4 tr(vec2 u){float o=bk(p*p);float b=sin(PI*p);float y=u.y-o;vec2 d=vec2(0.,.12*b);return y>=0.?dbA(vec2(u.x,y),d):dbB(vec2(u.x,y+1.),d);}`, 'Feed scroll', 'سكرول فيد'],
    ['yRainGlass', 'blur', `vec4 tr(vec2 u){float b=sin(PI*p),w=smoothstep(.35,.65,p);float cx=floor(u.x*7.);vec2 s=vec2(u.x*7.,u.y*3.5+p*(2.+2.*h1(vec2(cx,3.))));vec2 c=floor(s),f=fract(s)-.5;
  vec2 o=(vec2(h1(c),h1(c+7.))-.5)*.4;float d=length((f-o)*vec2(1.,1.3));float has=step(.35,h1(c+2.));vec4 bl=mix(bA(u,.02),bB(u,.02),w);
  vec4 dr=mixAB(u-(f-o)*vec2(.12,.25),w);vec4 r=mix(bl,dr,smoothstep(.22,.18,d)*has);r.rgb+=.25*smoothstep(.2,.17,d)*smoothstep(.1,.2,d)*has*step(0.,f.y-o.y);
  return mix(mixAB(u,w),r,smoothstep(0.,.3,b));}`, 'Rain on glass', 'مطر على إزاز'],
    // ---- tearing, weather and things passing by
    ['yClaw', 'mask', `vec4 tr(vec2 u){vec2 q=sq(u);float x=dot(q,normalize(vec2(1.,.55)))+vn(u*40.)*.015;float d=9.;for(int i=0;i<3;i++){float k=float(i);d=min(d,abs(x-(k-1.)*.28)*3.+k*.1);}
  float w=wp(d,.03);vec4 o=mix(TA(u),TB(u),w);o.rgb=mix(o.rgb,vec3(.45,.07,.05),w*(1.-w)*2.4);return o;}`, 'Claw marks', 'خربشة مخالب'],
    ['ySlash', 'slide', `vec4 tr(vec2 u){vec2 n=normalize(vec2(1.,.6)),t=vec2(-n.y,n.x);vec2 q=sq(u);float sd=dot(q,n);float side=sign(sd+1e-5);float e=ei(clamp((p-.15)/.85,0.,1.));
  vec2 s=q-side*(t*e*1.3+n*e*.25);vec2 a=s/vec2(AS(),1.)+.5;vec4 o=(inb(a)&&sign(dot(s,n)+1e-5)==side)?TA(a):TB(u);
  o.rgb+=sin(PI*clamp(p/.24,0.,1.))*exp(-abs(sd)*120.);return o;}`, 'Sword cut', 'ضربة سيف'],
    ['yWaterFill', 'mask', `vec4 tr(vec2 u){float e=io(p);float L=e*1.12-.06+.02*sin(u.x*18.+p*12.)*sin(PI*p);if(u.y>L)return TA(u);float dp=L-u.y;
  vec2 v=u+vec2(sin(u.y*30.+p*10.),cos(u.x*25.+p*8.))*.006*(1.-p);vec4 o=TB(v);o.rgb=mix(o.rgb,o.rgb*vec3(.55,.8,1.),(1.-p)*.7);o.rgb+=vec3(.7,.9,1.)*exp(-dp*80.)*.5*(1.-p);return o;}`, 'Water fills up', 'مية بتعلى'],
    ['yPaintRoller', 'mask', `vec4 tr(vec2 u){float i=floor((1.-u.y)*3.);float t=p*3.2-i*1.05;float x=mod(i,2.)<1.?u.x:1.-u.x;float ed=x+vn(vec2(u.y*60.,x*4.))*.04;float f=t*1.08-.04;
  float w=step(ed,f);vec4 o=X(u,w);o.rgb*=1.-.15*w*vn(u*vec2(4.,90.))*(1.-p);o.rgb*=1.-.35*smoothstep(.03,0.,abs(ed-f))*step(0.,t)*step(t,1.);return o;}`, 'Paint roller', 'رولة دهان'],
    ['ySpray', 'mask', `vec4 tr(vec2 u){float r=floor((1.-u.y)*4.);float x=mod(r,2.)<1.?u.x:1.-u.x;float od=(r+x)/4.;float a=clamp((p*1.3-od)*5.,0.,1.);
  float h=h1(floor(u*R/2.));float w=step(h,a*a)*step(.0001,a);vec4 o=X(u,w);o.rgb=mix(o.rgb,TB(u).rgb,exp(-pow((p*1.3-od)*5.-.5,2.)*4.)*sin(PI*p)*.3);return o;}`, 'Spray paint', 'بخاخة'],
    ['yRipFall', 'slide', `vec4 tr(vec2 u){float e=clamp(p*1.15-.05,0.,1.);float g=e*e*1.6;vec4 o=TB(u);o.rgb*=1.-.3*(1.-p);
  for(int k=0;k<2;k++){float sg=k==0?-1.:1.;vec2 s=rc(u-vec2(sg*g*.15,-g),vec2(.5+sg*.25,0.),sg*g*.9);float cut=.5+(vn(vec2(s.y*10.,3.))-.5)*.08+(vn(vec2(s.y*40.,8.))-.5)*.02;
  if(inb(s)&&(sg<0.?s.x<cut:s.x>=cut)){vec4 a=TA(s);a.rgb*=1.-.25*e;o=a;}}return o;}`, 'Torn and dropped', 'اتقطع ووقع'],
    ['yStickers', 'mask', `vec4 tr(vec2 u){vec4 o=TA(u);for(int i=0;i<18;i++){float k=float(i);float a=clamp((p-.04-k/18.*.76)*8.,0.,1.);if(a<=0.)continue;
  vec2 c=vec2(h1(vec2(k,1.)),h1(vec2(k,2.)));float sz=.18+.22*h1(vec2(k,3.));vec2 l=rot(sq(u)-sq(c),(h1(vec2(k,4.))-.5)*.8)/(sz*(1.25-.25*eo(a)));
  vec2 bx=abs(l)-vec2(1.,.7);float dd=length(max(bx,0.))+min(max(bx.x,bx.y),0.)-.12;if(dd>0.&&dd<.07)o.rgb*=.8;if(dd<0.)o=dd<-.06?TB(u):vec4(1.,1.,1.,1.);}
  return mix(o,TB(u),smoothstep(.8,1.,p));}`, 'Stickers', 'استيكرز'],
    ['yPassBy', 'light', `vec4 tr(vec2 u){vec2 q=sq(u);float cx=mix(-2.9,2.9,p);float d=length((q-vec2(cx,-.2))*vec2(.55,.75));vec4 o=X(u,p);o.rgb*=1.-.94*smoothstep(1.05,.75,d);return o;}`, 'Someone walks by', 'حد عدّى قدام الكاميرا'],
    ['yFlashlight', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 q=sq(u);vec2 c=vec2(sin(p*7.)*.55,cos(p*5.)*.3);float sp=smoothstep(.42,.25,length(q-c));vec4 o=mixAB(u,smoothstep(.45,.55,p));
  o.rgb*=mix(1.,.04+1.1*sp,smoothstep(0.,.35,b*b));return o;}`, 'Flashlight', 'كشاف'],
    ['yTVWall', 'geo', `vec4 tr(vec2 u){float b=sin(PI*p);float k=smoothstep(.25,.85,b);float z=1.+2.*k;vec2 v=.5+(u-.5)*z;vec2 c=floor(v),f=fract(v);float bz=.05*k;
  if(min(min(f.x,f.y),min(1.-f.x,1.-f.y))<bz)return vec4(vec3(.08),1.);float t=.3+.4*h1(c+3.);vec4 o=p<t?TA(f):TB(f);o.rgb=mix(o.rgb,vec3(h1(u*R+p)),exp(-pow((p-t)*40.,2.)));return o;}`, 'Wall of TVs', 'حيطة شاشات'],
    ['yHeartbeat', 'cam', `vec4 tr(vec2 u){float a=exp(-pow((p-.32)*14.,2.)),c=exp(-pow((p-.52)*14.,2.));vec4 o=X(zm(u,vec2(.5),1.+.12*a+.2*c),step(.52,p));
  o.rgb=mix(o.rgb,o.rgb*vec3(1.25,.55,.55),(a+c)*.6*(.3+.7*length(sq(u))));return o;}`, 'Heartbeat', 'دقة قلب'],
    ['yDust', 'mask', `vec4 tr(vec2 u){vec2 g=floor(u*R/3.);float ag=p*1.7-(u.x*.6+h1(g)*.4);vec4 o=ag<0.?TA(u):TB(u);vec2 s=u-vec2(.35,.12)*max(ag,0.);vec2 sg=floor(s*R/3.);
  float as=p*1.7-(s.x*.6+h1(sg)*.4);if(as>0.&&as<.7&&h1(sg+7.)>.45)o=mix(o,TA(s),1.-as/.7);return o;}`, 'Blown to dust', 'بيطير تراب'],
    ['yCrumple', 'warp', `vec4 tr(vec2 u){float e=io(p);float s=max(1.-e*.97,.02);vec2 q=sq(u)/s;vec2 n=vec2(vn(q*3.+1.),vn(q*3.+7.))-.5;vec2 a=(q+n*e*.5)/vec2(AS(),1.)+.5;
  bool ins=inb(a)&&length(q)<mix(9.,.95,smoothstep(.1,.5,e))+.12*(vn(q*6.)-.5);vec4 o=TB(u);o.rgb*=1.-.35*(1.-e)*step(.001,e);
  if(ins){o=TA(a);o.rgb*=1.-e*1.6*abs(n.x+n.y);}return mix(o,TB(u),smoothstep(.85,1.,p));}`, 'Crumpled paper', 'ورقة بتتكرمش'],
    ['yPlasma', 'light', `vec4 tr(vec2 u){vec2 q=sq(u)*3.;float t=p*4.;float v=sin(q.x*2.+t)+sin(q.y*3.-t)+sin((q.x+q.y)*2.+t*.7)+sin(length(q)*3.-t);float d=v*.125+.5;float w=wp(d,.2);
  vec4 o=mix(TA(u),TB(u),w);o.rgb=mix(o.rgb,.5+.5*cos(6.28*(d+vec3(0.,.33,.67))+t),w*(1.-w)*3.2);return o;}`, 'Plasma', 'بلازما'],
    ['yMondrian', 'geo', `vec3 mc(float i){return i<.5?vec3(.85,.12,.1):i<1.5?vec3(.95,.93,.88):i<2.5?vec3(.1,.2,.6):i<3.5?vec3(.95,.8,.1):i<4.5?vec3(.95,.93,.88):i<5.5?vec3(.1,.2,.6):vec3(.85,.12,.1);}
vec4 tr(vec2 u){float id;float dl=abs(u.x-.62);if(u.x<.62){dl=min(dl,abs(u.y-.65));if(u.y>.65)id=0.;else{dl=min(dl,abs(u.x-.25));id=u.x<.25?1.:2.;}}
  else{dl=min(dl,abs(u.y-.4));if(u.y>.4){dl=min(dl,abs(u.x-.82));id=u.x<.82?3.:4.;}else{dl=min(dl,abs(u.y-.15));id=u.y>.15?5.:6.;}}
  float t=id*.09;vec4 o=mix(TA(u),vec4(mc(id),1.),smoothstep(t,t+.1,p)*.85);o=mix(o,TB(u),smoothstep(t+.25,t+.35,p));if(dl<.01*sin(PI*p))o=vec4(0.,0.,0.,1.);return o;}`, 'Mondrian', 'لوحة موندريان'],
    ['yPortal', 'light', `vec4 tr(vec2 u){vec2 q=sq(u);float e=io(p);float d=length(q);float a=atan(q.y,q.x);float rr=e*1.2+.03*sin(a*7.+p*30.)*sin(PI*p);
  vec4 o=d<rr?TB(rc(u,vec2(.5),(1.-e)*2.)):TA(u);float ring=exp(-pow((d-rr)*30.,2.))*sin(PI*p);o.rgb+=vec3(1.,.55,.15)*ring*(1.+vn(vec2(a*6.+p*20.,d*20.-p*15.)))*1.2;return o;}`, 'Portal', 'بوابة'],
    ['yRift', 'glitch', `vec4 tr(vec2 u){float e=io(p);float j=(vn(vec2(u.y*14.,2.))-.5)*.12+(vn(vec2(u.y*50.,5.))-.5)*.03;float x=u.x-.5-j*(1.-e);float g=e*.62;
  if(abs(x)<g){vec4 o=TB(u);o.r=TB(u+vec2(.01,0.)*(1.-e)).r;o.rgb+=vec3(.6,.8,1.)*exp(-(g-abs(x))*60.)*(1.-p);return o;}
  vec4 o=TA(vec2(u.x-sign(x)*g*.5,u.y));o.rgb+=vec3(.5,.7,1.)*exp(-(abs(x)-g)*80.)*sin(PI*p);return o;}`, 'Space rift', 'شق في الفضا'],
    ['yBeam', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);float wd=.02+b*.3;float x=abs(u.x-.5);float col=smoothstep(wd,wd*.5,x)*smoothstep(0.,.15,b);float hh=h1(floor(u*R/2.));
  float sp=step(.97,h1(floor(u*R/2.)+floor(p*30.)))*col;float w=wp(x/.5*.6+hh*.4,.1);vec4 o=mix(TA(u),TB(u),w);o.rgb+=vec3(.7,.85,1.)*(col*.22+sp*.7)*b;return o;}`, 'Beam me up', 'شعاع نقل'],
    ['yDominoes', '3d', `vec4 tr(vec2 u){vec4 o=TB(u);for(int i=0;i<8;i++){float k=float(i);float t=clamp(p*1.6-k*.075,0.,1.);vec2 s=rc(u,vec2((k+1.)/8.,0.),ei(t)*1.6);
  if(s.x>=k/8.&&s.x<(k+1.)/8.&&s.y>=0.&&s.y<=1.){vec4 a=TA(s);a.rgb*=1.-.4*t;o=mix(a,TB(u),smoothstep(.5,.85,t));}}return o;}`, 'Dominoes', 'دومينو'],
    ['ySnowCover', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec4 o=mixAB(u,smoothstep(.4,.6,p));float s=0.;for(int i=0;i<3;i++){float k=float(i)+1.;vec2 g=u*vec2(AS(),1.)*6.*k+vec2(sin(p*6.+k)*.5,p*8.*k);
  vec2 c=floor(g),f=fract(g)-.5;vec2 o2=(vec2(h1(c+k),h1(c+k*3.))-.5)*.6;s+=smoothstep(.24/k,0.,length(f-o2))*step(.5,h1(c+9.));}
  float cv=smoothstep(.2,1.,b)*(.7+.3*fbm(u*6.));o.rgb=mix(o.rgb,vec3(.95,.97,1.),max(cv*.9,min(s,1.)*smoothstep(0.,.3,b)));return o;}`, 'Snowed in', 'تلج بيغطي'],
    ['yConfetti', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec4 o=mixAB(u,smoothstep(.45,.55,p));for(int i=0;i<2;i++){float k=float(i)+1.;vec2 g=u*vec2(AS(),1.)*10.*k+vec2(0.,p*6.*k);vec2 c=floor(g),f=fract(g)-.5;
  vec2 l=rot(f-(vec2(h1(c+2.),h1(c+5.))-.5)*.5,h1(c)*6.28+p*10.*k);float pc=step(abs(l.x),.18)*step(abs(l.y),.07*(.5+.5*abs(sin(p*20.+h1(c)*9.))));
  if(pc>0.&&h1(c+3.)<b*.9)o.rgb=.5+.5*cos(6.28*(h1(c+4.)+vec3(0.,.33,.67)));}return o;}`, 'Confetti', 'كونفيتي'],
    // ---- art styles and camera ideas
    ['yDepthZoom', 'cam', `vec4 tr(vec2 u){float b=sin(PI*p);float w=step(.5,p);vec4 c0=X(u,w);return X(zm(u,vec2(.5),1.+b*(.08+.9*lu(c0))),w);}`, 'Depth zoom', 'زووم بعمق'],
    ['yKenBurns', 'cam', `vec4 tr(vec2 u){vec4 a=TA(zm(u,vec2(.3,.62),1.+.3*p)),c=TB(zm(u,vec2(.7,.38),1.+.3*(1.-p)));return mix(a,c,smoothstep(.25,.75,p));}`, 'Ken Burns', 'كين بيرنز'],
    ['yPiP', 'slide', `vec4 tr(vec2 u){float ee=io(clamp((p-.45)/.55,0.,1.));float s=p<.3?.32*eo(p/.3):mix(.32,1.,ee);vec2 c=mix(vec2(.78,.74),vec2(.5),ee);if(s<.001)return TA(u);
  vec2 a=.5+(u-c)/s;vec2 ab=.5+(u-c)/(s+.04*(1.-ee));vec4 o=TA(u);o.rgb*=1.-.25*sin(PI*p);if(inb(.5+(u-c+vec2(-.01,.012)*(1.-ee))/s))o.rgb*=.6;
  if(inb(ab))o=vec4(1.,1.,1.,1.);if(inb(a))o=TB(a);return o;}`, 'Picture window', 'شباك صغير بيكبر'],
    ['yWarpSpeed', 'blur', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 q=sq(u);float a=atan(q.y,q.x);float d=length(q);float h=h1(vec2(floor(a*160./6.2832),3.));float L=fract(h*7.+p*3.)*.4;
  float s=smoothstep(0.,.02,d-L)*smoothstep(L+.15*b+.01,L,d)*step(.6,h);vec4 o=mix(zbA(u,.25*b),zbB(u,.25*b),smoothstep(.4,.6,p));o.rgb+=vec3(.8,.9,1.)*s*b*1.5;return o;}`, 'Warp speed', 'سرعة الضوء'],
    ['yOilSlick', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);float f=fbm(u*3.+vec2(p,-p)*1.5)+fbm(u*5.-p)*.5;vec3 film=.5+.5*cos(6.2832*(f*2.+vec3(0.,.33,.67))+p*6.);
  vec4 o=mixAB(u+vec2(f-.6)*.03*b,smoothstep(.4,.6,p));o.rgb=mix(o.rgb,o.rgb*.5+film*.6,b*.75);return o;}`, 'Oil film', 'بقعة زيت'],
    ['yMarble', 'warp', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 q=u*3.;float f=fbm(q+fbm(q*1.5+p));vec2 v=u+(vec2(f,fbm(q+3.))-.5)*.2*b;vec4 o=mixAB(v,smoothstep(.4,.6,p));
  float vein=abs(sin((u.x+u.y)*8.+f*10.));o.rgb=mix(o.rgb,o.rgb*.9+vec3(.08),b*.5);o.rgb*=1.-b*.6*smoothstep(.12,0.,vein);return o;}`, 'Marble', 'رخام'],
    ['yStainedGlass', 'geo', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 s=sq(u)*6.;vec2 c=floor(s);float m1=9.,m2=9.;vec2 mc=vec2(0.);for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++){vec2 g=c+vec2(float(i),float(j));
  vec2 o=g+vec2(h1(g),h1(g+3.));float d=length(s-o);if(d<m1){m2=m1;m1=d;mc=o;}else if(d<m2)m2=d;}vec2 cu=mc/6./vec2(AS(),1.)+.5;float t=.3+.4*h1(mc);vec4 fl=p<t?TA(cu):TB(cu);
  fl.rgb=fl.rgb*1.05*(.85+.3*(1.-m1));vec4 g2=mix(fl,vec4(.05,.05,.05,1.),smoothstep(.06,.03,m2-m1));return mix(X(u,p),g2,smoothstep(.15,.7,b));}`, 'Stained glass', 'زجاج معشق'],
    ['yCrossStitch', 'geo', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 g=vec2(50.*AS(),50.);vec2 c=floor(u*g),f=fract(u*g)-.5;float t=.35+.3*h1(c);vec4 col=p<t?TA((c+.5)/g):TB((c+.5)/g);
  float x=min(abs(f.x-f.y),abs(f.x+f.y));float st=smoothstep(.16,.08,x)*step(max(abs(f.x),abs(f.y)),.42);vec3 fab=vec3(.92,.9,.84)*(.9+.1*step(.5,fract((u.x+u.y)*g.y*2.)));
  return mix(X(u,p),vec4(mix(fab,col.rgb*(.8+.4*(.16-x)/.16),st),1.),smoothstep(.25,.8,b));}`, 'Cross stitch', 'تطريز'],
    ['yToyBricks', 'geo', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 g=vec2(30.*AS(),30.);vec2 c=floor(u*g),f=fract(u*g)-.5;vec4 col=X((c+.5)/g,p);float d=length(f);float st=smoothstep(.32,.28,d);
  float hl=dot(normalize(f+1e-4),vec2(-.7,.7));vec3 r=col.rgb*(.85+.15*step(max(abs(f.x),abs(f.y)),.46));r=mix(r,r*(1.+.35*hl),st*smoothstep(.2,.3,d));return mix(X(u,p),vec4(r,1.),smoothstep(.25,.8,b));}`, 'Toy bricks', 'مكعبات لعب'],
    ['yComic', 'geo', `vec4 tr(vec2 u){float gut=.012*smoothstep(1.,.75,p)*step(.001,p);float id;vec4 r4;
  if(u.y>.5){id=u.x<.55?0.:1.;r4=u.x<.55?vec4(0.,.5,.55,1.):vec4(.55,.5,1.,1.);}else{id=u.x<.4?2.:3.;r4=u.x<.4?vec4(0.,0.,.4,.5):vec4(.4,0.,1.,.5);}
  float a=eo(clamp((p-.08-id*.15)/.2,0.,1.));float ed=min(min(u.x-r4.x,r4.z-u.x),min(u.y-r4.y,r4.w-u.y));if(ed<gut)return vec4(1.,1.,1.,1.);if(a<=0.)return TA(u);
  vec2 c=(r4.xy+r4.zw)*.5;vec2 dir=id<.5?vec2(-1.,0.):id<1.5?vec2(0.,1.):id<2.5?vec2(0.,-1.):vec2(1.,0.);vec2 sv=u-dir*(1.-a)*.5;
  if(sv.x<r4.x||sv.x>r4.z||sv.y<r4.y||sv.y>r4.w)return TA(u);return TB(zm(sv,c,1.+.4*(1.-a)));}`, 'Comic panels', 'مربعات كوميكس'],
    ['yPow', 'shape', `vec4 tr(vec2 u){vec2 q=sq(u);float e=eo(p);float a=atan(q.y,q.x)/6.2832*12.;float sp=.75+.25*abs(fract(a)*2.-1.)+.06*h1(vec2(floor(a),1.));float rr=io(p)*2.2*sp;float d=length(q);
  if(d<rr-.18*(1.-p))return TB(u);if(d<rr){vec2 hd=fract(u*vec2(AS(),1.)*60.)-.5;vec3 y=mix(vec3(1.,.85,.1),vec3(1.,.45,.1),step(length(hd),.25));return vec4(mix(vec3(.85,.1,.1),y,step(.035,rr-d)),1.);}return TA(u);}`, 'Comic burst', 'انفجار كوميكس'],
    ['ySpeedLines', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 q=sq(u);float a=atan(q.y,q.x)/6.2832*90.;float h=h1(vec2(floor(a),floor(p*12.)));float d=length(q);
  float ln=smoothstep(.5,0.,abs(fract(a)-.5)*2.-(1.-d/1.2)*.6)*step(mix(1.2,.25,b)+h*.3,d)*step(.45,h);vec4 o=mixAB(u,smoothstep(.45,.55,p));o.rgb=mix(o.rgb,vec3(.97),b*.35);o.rgb*=1.-ln*b;return o;}`, 'Manga speed lines', 'خطوط مانجا'],
    ['yBlueprint', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 e=1.5/R;vec4 c=X(u,p);float gx=lu(X(u+vec2(e.x,0.),p))-lu(X(u-vec2(e.x,0.),p)),gy=lu(X(u+vec2(0.,e.y),p))-lu(X(u-vec2(0.,e.y),p));
  float ed=smoothstep(.05,.2,length(vec2(gx,gy)));vec2 gr=fract(u*vec2(AS(),1.)*20.);float grid=min(step(gr.x,.04)+step(gr.y,.04),1.);
  return mix(c,vec4(vec3(.08,.25,.55)+vec3(.15)*grid+vec3(.85)*ed,1.),smoothstep(.25,.8,b));}`, 'Blueprint', 'بلوبرنت'],
    ['ySketch', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec4 c=X(u,p);float l=lu(c);vec2 q=u*R;float k=step(fract((q.x+q.y)/5.),.3)*step(l,.75)+step(fract((q.x-q.y)/5.),.3)*step(l,.45)+step(fract(q.x/3.),.35)*step(l,.25);
  return mix(c,vec4(vec3(.96,.95,.92)*(1.-min(k,1.)*.75),1.),smoothstep(.25,.8,b));}`, 'Pencil sketch', 'رسم رصاص'],
    ['yStamp', 'shape', `vec4 tr(vec2 u){float t=clamp(p/.35,0.,1.);float s=mix(1.7,1.,ei(t));vec2 a=.5+(rc(u,vec2(.5),(1.-ei(t))*.2)-.5)/s;float hit=exp(-max(p-.35,0.)*25.)*step(.35,p);vec2 j=vec2(0.,hit*.01*sin(p*90.));
  vec4 o=TA(u+j);if(t<1.){if(inb(a))o=mix(o,TB(a),.35*ei(t));else o.rgb*=1.-.4*ei(t);return o;}float cov=mix(.5,1.05,eo((p-.35)/.65));if(vn(u*60.)*.6+vn(u*8.)*.4<cov){vec4 c=TB(u+j);c.rgb*=1.-.25*(1.-p)*vn(u*120.);return c;}return o;}`, 'Rubber stamp', 'ختم'],
    ['yTileZoom', 'geo', `vec4 tr(vec2 u){vec2 g=vec2(6.,4.);vec2 c=floor(u*g),f=fract(u*g)-.5;float t=clamp(p*1.5-h1(c)*.5,0.,1.);float z=1.+2.5*sin(PI*t);vec2 v=(c+.5+f/z)/g;vec4 o=t<.5?TA(v):TB(v);
  o.rgb*=1.-.3*step(.47,max(abs(f.x),abs(f.y)))*sin(PI*t);return o;}`, 'Tiles magnify', 'مربعات بتكبّر'],
    ['yDream', 'blur', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 v=u+vec2(sin(u.y*20.+p*25.)*.02*b,0.);float w=smoothstep(.3,.7,p);vec4 o=mixAB(v,w);vec4 gl=mix(bA(v,.03),bB(v,.03),w);
  o.rgb=mix(o.rgb,max(o.rgb,gl.rgb)*1.15+vec3(.08,.04,.1),b*.7);return o;}`, 'Dream', 'حلم'],
    ['yLensDirt', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 q=sq(u);float fl=exp(-length((q-vec2(mix(-1.4,1.4,p),.15))*vec2(.6,1.))*2.5);float dirt=smoothstep(.55,.8,fbm(u*5.))*.8+step(.985,h1(floor(u*R/4.)))*.6;
  vec4 o=mixAB(u,smoothstep(.35,.65,p));o.rgb+=vec3(1.,.9,.75)*(fl*.5+fl*dirt*1.8)*b;return o;}`, 'Dirty lens flare', 'عدسة متربة'],
    ['yPopArt', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);float k=smoothstep(.2,.7,b);vec2 v=u*(1.+k);vec2 c=floor(v),f=fract(v);vec4 o=X(f,p);float id=mod(c.x+c.y*2.+4.,4.);float l=lu(o);
  vec3 t1=id<.5?vec3(1.,.2,.5):id<1.5?vec3(.2,.8,1.):id<2.5?vec3(1.,.9,.1):vec3(.4,1.,.3);vec3 t2=id<.5?vec3(.1,.1,.6):id<1.5?vec3(.7,.1,.4):id<2.5?vec3(.9,.2,.1):vec3(.1,.3,.6);
  return mix(X(u,p),vec4(l>.5?t1:t2,1.),k);}`, 'Pop art', 'بوب آرت'],
    ['yPaperCut', 'slide', `vec4 tr(vec2 u){vec4 o=TA(u);for(int i=0;i<3;i++){float k=float(i);float t=clamp((p-k*.18)/.45,0.,1.);vec2 v=u+vec2(0.,(1.-bk(t*t))*1.1);
  if(t>0.&&v.y<=1.){vec4 c=TB(v);if(floor(lu(c)*3.)>=k)o=vec4(floor(c.rgb*4.+.5)/4.*(.8+.1*k),1.);else if(k>0.&&floor(lu(TB(v+vec2(-.006,.01)))*3.)>=k)o.rgb*=.6;}}
  return mix(o,TB(u),smoothstep(.85,1.,p));}`, 'Paper cut layers', 'طبقات ورق'],
    ['yPointillism', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 g=vec2(40.*AS(),40.);vec2 s=u*g;vec3 acc=vec3(.97,.96,.93);vec2 c=floor(s);for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++){vec2 k=c+vec2(float(i),float(j));
  vec2 o=k+vec2(h1(k),h1(k+5.));if(length(s-o)<.5+.4*h1(k+9.))acc=X(o/g,p+(h1(k+2.)-.5)*.3*b).rgb*1.1;}return mix(X(u,p),vec4(acc,1.),smoothstep(.25,.8,b));}`, 'Dot painting', 'رسم بالنقط'],
    ['yReeded', 'blur', `vec4 tr(vec2 u){float b=sin(PI*p);float bb=smoothstep(.1,.6,b);float n=36.;float c=floor(u.x*n),f=fract(u.x*n)-.5;vec4 o=mixAB(vec2((c+.5+f*(1.-2.6*bb))/n,u.y),smoothstep(.4,.6,p));
  o.rgb*=1.+.18*bb*cos(f*6.2832);return o;}`, 'Ribbed glass', 'إزاز مضلع'],
    // ---- shapes and patterns
    ['yCrescent', 'shape', `vec4 tr(vec2 u){float e=io(p);float r=e*1.4;vec2 q=rot(sq(u),p*2.);float d=max(length(q)-r,-(length(q-vec2(.4,0.)*r)-r*.85*(1.-e*e)));return X(u,step(d,0.)*step(.001,p));}`, 'Crescent moon', 'هلال'],
    ['yFlower', 'shape', `vec4 tr(vec2 u){vec2 q=sq(u);float a=atan(q.y,q.x)+p*2.;float rb=ei(p)*1.6;float d=length(q)-rb*(.75+.25*cos(5.*a));vec4 o=X(u,step(d,0.)*step(.001,p));o.rgb*=1.-.3*smoothstep(.03,0.,abs(d))*sin(PI*p);return o;}`, 'Flower', 'وردة'],
    ['yGear', 'shape', `vec4 tr(vec2 u){vec2 q=sq(u);float a=atan(q.y,q.x)-p*3.;float rb=mix(io(p),ei(p),.6)*1.15;float d=length(q)-rb*(1.+.13*smoothstep(-.2,.2,sin(12.*a)));vec4 o=X(u,step(d,0.)*step(.001,p));
  o.rgb=mix(o.rgb,vec3(.7,.72,.75),smoothstep(.02,0.,abs(d))*sin(PI*p));return o;}`, 'Gear', 'ترس'],
    ['yCloud', 'shape', `vec4 tr(vec2 u){vec2 q=sq(u);float s=ei(p)*3.2;float d=9.;for(int i=0;i<5;i++){float k=float(i);vec2 c=vec2(k==0.?-.5:k==1.?0.:k==2.?.45:k==3.?-.2:.25,k==0.?0.:k==1.?.2:k==2.?.05:k==3.?-.1:-.15);
  float r=k==0.?.35:k==1.?.45:k==2.?.38:.3;d=min(d,length(q-c*s)-r*s);}vec4 o=X(u,step(d,0.)*step(.001,p));o.rgb+=vec3(.9)*smoothstep(.03,0.,abs(d))*sin(PI*p)*.6;return o;}`, 'Cloud', 'سحابة'],
    ['ySpeech', 'shape', `vec4 tr(vec2 u){vec2 q=sq(u);float e=io(p);e=ei(p);vec2 a=vec2(-.7,-.45);vec2 c=mix(a+vec2(.35,.25),vec2(0.),smoothstep(0.,.6,e));vec2 rr=vec2(.5,.33)*e*4.;
  float el=length((q-c)/max(rr,vec2(1e-4)))-1.;vec2 ca=c-a;float t=clamp(dot(q-a,ca)/dot(ca,ca),0.,1.);bool tl=length(q-(a+t*ca))<t*.12*min(e*4.,1.)&&e>0.;
  bool ins=(el<0.&&e>0.)||tl;vec4 o=ins?TB(u):TA(u);if(!ins&&el<.08/max(rr.x,.01))o.rgb*=1.-.4*sin(PI*p);return o;}`, 'Speech bubble', 'بالونة كلام'],
    ['yInfinity', 'shape', `vec4 tr(vec2 u){vec2 q=rot(sq(u),p*1.5);float a=ei(p)*1.6+.001;float f=(dot(q,q)*dot(q,q))-2.*a*a*(q.x*q.x-q.y*q.y);vec4 o=X(u,step(f,0.));
  o.rgb+=vec3(1.,.8,.4)*smoothstep(.02*a*a,0.,abs(f))*sin(PI*p);return mix(o,TB(u),smoothstep(.75,1.,p));}`, 'Infinity', 'لا نهاية'],
    ['yHourglass', 'shape', `vec4 tr(vec2 u){vec2 q=sq(u);float s=io(p)*2.;bool ins=abs(q.y)<s&&abs(q.x)<abs(q.y)*.9+max(s-1.,0.)&&p>0.;vec4 o=ins?TB(u):TA(u);
  if(!ins&&abs(abs(q.x)-abs(q.y)*.9-max(s-1.,0.))<.015&&abs(q.y)<s)o.rgb=mix(o.rgb,vec3(.95,.85,.6),sin(PI*p));return o;}`, 'Hourglass', 'ساعة رملية'],
    ['yDrop', 'shape', `vec4 tr(vec2 u){float e=ei(p);vec2 q=sq(u)-vec2(0.,.7-e*.7);float rb=e*2.4;float d=length(q)-rb*(1.-.7*clamp(q.y/(rb*1.8+1e-4),0.,1.));vec4 o=X(u,step(d,0.)*step(.001,p));
  o.rgb+=vec3(.6,.8,1.)*smoothstep(.03,0.,abs(d))*sin(PI*p)*.7;return o;}`, 'Drop', 'نقطة مية'],
    ['yBolt', 'shape', `vec4 tr(vec2 u){vec2 q=sq(u);float zz=(abs(fract(q.y*1.6+.25)-.5)-.25)*.7;float w=io(p)*1.3;float d=abs(q.x-zz)-w;vec4 o=X(u,step(d,0.)*step(.001,p));
  o.rgb+=vec3(.8,.9,1.)*exp(-abs(d)*60.)*sin(PI*p);return o;}`, 'Lightning bolt', 'برق متعرج'],
    ['yHouse', 'shape', `vec4 tr(vec2 u){vec2 q=sq(u)+vec2(0.,.15);float s=ei(p)*1.9;bool ins=p>0.&&((abs(q.x)<s&&q.y<s*.35&&q.y>-s)||(q.y>=s*.35&&abs(q.x)<s*1.15-(q.y-s*.35)));vec4 o=ins?TB(u):TA(u);
  if(!ins)o.rgb*=1.-.25*sin(PI*p);return o;}`, 'Little house', 'بيت'],
    ['yBowtie', 'shape', `vec4 tr(vec2 u){vec2 q=sq(u);float s=ei(p)*2.3;float tip=AS()*.5-s;bool ins=abs(q.x)>tip+abs(q.y)*.8&&p>0.;vec4 o=ins?TB(u):TA(u);
  o.rgb+=vec3(.3)*smoothstep(.02,0.,abs(abs(q.x)-tip-abs(q.y)*.8))*sin(PI*p);return o;}`, 'Bow tie', 'فيونكة'],
    ['ySnowflake', 'shape', `vec4 tr(vec2 u){vec2 q=sq(u);float a=atan(q.y,q.x)+p;float rb=io(p)*2.5;float d=length(q)-rb*(.4+.6*pow(abs(cos(3.*a)),8.)+.15*pow(abs(cos(9.*a)),4.));
  vec4 o=X(u,step(d,0.)*step(.001,p));o.rgb+=vec3(.7,.85,1.)*smoothstep(.02,0.,abs(d))*sin(PI*p);return o;}`, 'Snowflake', 'ندفة تلج'],
    ['yChomp', 'shape', `vec4 tr(vec2 u){float c=sin(PI*p);c=c*c*(3.-2.*c);float th=abs(fract(u.x*8.)-.5)*.16;float top=1.1-c*.66,bot=c*.66-.1;vec4 o=X(u,p);
  if(u.y>top-.08+th)o=u.y>top?vec4(.35,.05,.08,1.):vec4(.95,.93,.88,1.);if(u.y<bot+.08-th)o=u.y<bot?vec4(.35,.05,.08,1.):vec4(.95,.93,.88,1.);return o;}`, 'Chomp', 'قضمة'],
    ['yDiamondWave', 'geo', `vec4 tr(vec2 u){vec2 q=rot(sq(u),.7854)*6.;vec2 c=floor(q),f=fract(q)-.5;vec2 cc=rot((c+.5)/6.,-.7854)/vec2(AS(),1.)+.5;float t=clamp(p*1.6-(cc.x+cc.y)*.3,0.,1.);
  return X(u,step(max(abs(f.x),abs(f.y)),t*.51)*step(.001,t));}`, 'Diamond wave', 'معينات موجة'],
    ['yCheckerSlide', 'geo', `vec4 tr(vec2 u){vec2 g=vec2(6.,4.);vec2 c=floor(u*g),f=fract(u*g);float t=clamp(p*1.5-c.x/6.*.5,0.,1.);float sg=mod(c.x+c.y,2.)<1.?1.:-1.;
  vec2 fa=f-vec2(0.,sg*io(t));if(fa.y>=0.&&fa.y<=1.){vec4 o=TA((c+fa)/g);o.rgb*=1.-.25*t;return o;}return TB(u);}`, 'Checker slide', 'شطرنج بيزحلق'],
    ['yQR', 'geo', `vec4 tr(vec2 u){vec2 g=vec2(21.*AS(),21.);vec2 c=floor(u*g);float h=h1(c),h2=h1(c+17.);vec2 cc=(c+.5)/g;vec4 o=TA(u);
  vec2 fd=min(abs(cc-vec2(.08*1.6/AS(),.88)),min(abs(cc-vec2(1.-.08*1.6/AS(),.88)),abs(cc-vec2(.08*1.6/AS(),.12))));float fq=max(fd.x*AS(),fd.y);bool fz=fq<.1;
  float m=fz?step(.5,fract(fq*15.)):step(.5,h);if(p>(fz?.1:h*.4))o=vec4(vec3(m*.95+.03),1.);if(p>(fz?.85:.5+h2*.4))o=TB(u);return o;}`, 'Code squares', 'مربعات كود'],
    ['yCircuit', 'geo', `vec4 tr(vec2 u){vec2 g=vec2(16.,10.);vec2 c=floor(u*g),f=fract(u*g);float h=h1(c);float ds=h<.5?abs(f.y-.5):abs(f.x-.5);float pad=length(f-.5);
  float od=c.x/16.*.6+h1(c+4.)*.15;float d=od+min(ds,pad*.7)*.5;float w=wp(d,.04);vec4 o=mix(TA(u),TB(u),w);o.rgb+=vec3(.3,1.,.6)*w*(1.-w)*3.*step(min(ds,pad*.7),.12);return o;}`, 'Circuit board', 'دايرة كهربا'],
    ['yMaze', 'geo', `vec4 tr(vec2 u){vec2 g=vec2(12.*AS(),12.);vec2 c=floor(u*g),f=fract(u*g);float h=h1(c);bool wall=(h<.5&&f.x>.82)||(h>=.5&&f.y>.82);float od=length(sq((c+.5)/g))/.95*.6+h1(c+3.)*.15;
  float w=wp(od+(wall?.25:0.),.04);vec4 o=mix(TA(u),TB(u),w);if(wall)o.rgb*=1.-.7*sin(PI*p);return o;}`, 'Maze', 'متاهة'],
    ['yEqualizer', 'mask', `vec4 tr(vec2 u){float i=floor(u.x*24.);float b=sin(PI*p);float hgt=io(p)*1.1+.25*sin(p*30.+i*1.7)*b+.1*h1(vec2(i,floor(p*20.)))*b;vec4 o=u.y<hgt?TB(u):TA(u);
  if(abs(u.y-hgt)<.012)o.rgb=mix(o.rgb,vec3(.4,1.,.7),b);if(fract(u.x*24.)<.08)o.rgb*=1.-.5*b;return o;}`, 'Equalizer', 'إكولايزر'],
    ['yTopo', 'mask', `vec4 tr(vec2 u){float f=fbm(u*2.5+3.);float d=clamp((f-.15)/.7,0.,1.);float w=wp(d,.03);vec4 o=mix(TA(u),TB(u),w);float ln=smoothstep(.07,0.,abs(fract(f*14.)-.5)-.43);
  o.rgb=mix(o.rgb,vec3(.95,.9,.75),ln*smoothstep(.2,0.,abs(d-p))*sin(PI*p));return o;}`, 'Contour map', 'خريطة كنتور'],
    ['yLeopard', 'geo', `vec4 tr(vec2 u){vec2 s=sq(u)*7.;vec2 c=floor(s);float m=9.;vec2 mc=vec2(0.);for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++){vec2 g=c+vec2(float(i),float(j));vec2 o=g+.2+.6*vec2(h1(g),h1(g+3.));float d=length(s-o);if(d<m){m=d;mc=o;}}
  float hh=h1(mc);float d=m<.22?.05+hh*.2:m<.34?.35+hh*.1:.6+m*.4;float w=wp(d,.04);vec4 o=mix(TA(u),TB(u),w);if(m>.22&&m<.34)o.rgb=mix(o.rgb,vec3(.25,.15,.05),sin(PI*p)*.8);return o;}`, 'Leopard spots', 'نقط نمر'],
    ['yCamo', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);float n=fbm(u*vec2(3.2,2.)+1.5);vec3 cm=n<.42?vec3(.2,.25,.15):n<.52?vec3(.38,.4,.22):n<.62?vec3(.45,.35,.22):vec3(.7,.65,.5);
  vec4 o=mix(TA(u),TB(u),wp(clamp((n-.2)/.6,0.,1.),.05));o.rgb=mix(o.rgb,cm*(.8+.4*lu(o)),smoothstep(.1,.7,b)*.85);return o;}`, 'Camouflage', 'تمويه'],
    ['yPlaid', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);float s1=step(.62,fract(u.x*7.+p*2.)),s2=step(.62,fract(u.y*5.-p*2.)),s3=step(.92,fract(u.x*21.)),s4=step(.92,fract(u.y*15.));
  vec3 tt=vec3(.62,.1,.12)*(1.-.45*s1)*(1.-.45*s2)+vec3(.15,.35,.15)*s1*s2+vec3(.9,.8,.3)*max(s3,s4)*.4;vec4 o=mixAB(u,smoothstep(.4,.6,p));o.rgb=mix(o.rgb,tt+o.rgb*.25,smoothstep(.15,.7,b)*.85);return o;}`, 'Plaid', 'كاروهات'],
    ['yCobweb', 'geo', `vec4 tr(vec2 u){vec2 q=sq(u);float r=length(q);float a=atan(q.y,q.x)/6.2832*12.;float sp=abs(fract(a)-.5)*r*.52;float rg=abs(fract(r*7.+fract(a)*.15)-.5)/7.;float ln=min(sp,rg);
  float d=ln<.012?r*.35:.3+r*.6;float w=wp(d,.05);vec4 o=mix(TA(u),TB(u),w);o.rgb+=vec3(.9)*smoothstep(.012,.004,ln)*sin(PI*p)*.5;return o;}`, 'Spider web', 'نسيج عنكبوت'],
    ['yLowPoly', 'geo', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 g=vec2(9.*AS(),9.);vec2 c=floor(u*g),f=fract(u*g);float h=h1(c);vec2 ct;float id;
  if(h<.5){bool up=f.x>f.y;ct=up?vec2(.67,.33):vec2(.33,.67);id=up?1.:2.;}else{bool up=f.x+f.y<1.;ct=up?vec2(.33,.33):vec2(.67,.67);id=up?3.:4.;}
  float t=.3+.4*h1(c+id);vec2 cu=(c+ct)/g;vec4 fl=p<t?TA(cu):TB(cu);fl.rgb*=.88+.24*h1(c*id);return mix(X(u,p),fl,smoothstep(.15,.6,b));}`, 'Low poly', 'مثلثات لو بولي'],
    // ---- looks, light shows and builds
    ['yDevelop', 'film', `vec4 tr(vec2 u){vec4 a=TA(u),c=TB(u);vec3 o=mix(a.rgb,vec3(.97,.96,.94),smoothstep(0.,.45,p));float t=clamp((p-.4)/.6,0.,1.);float l=lu(c);
  vec3 dv=mix(vec3(.97,.96,.94),c.rgb,smoothstep(l*.6,l*.6+.4,t));o=p<.4?o:dv;o=mix(o,o*vec3(1.,.55,.5),sin(PI*p)*.35);return vec4(o,1.);}`, 'Darkroom develop', 'تحميض صورة'],
    ['yWaveLines', 'glitch', `vec4 tr(vec2 u){float b=sin(PI*p);float n=30.;float r=floor(u.y*n);float best=0.;for(int k=-2;k<=2;k++){float yc=(r+float(k)+.5)/n;float l=lu(X(vec2(u.x,yc),p));
  best=max(best,smoothstep(.007,0.,abs(u.y-yc-(l-.5)*3./n)));}return mix(X(u,p),vec4(vec3(.85,1.,.9)*best,1.),smoothstep(.15,.7,b));}`, 'Signal lines', 'خطوط إشارة'],
    ['yChrome', 'light', `vec4 tr(vec2 u){float b=sin(PI*p),w=smoothstep(.4,.6,p);vec4 o=mixAB(u,w);float l=lu(mix(bA(u,.01),bB(u,.01),w));
  float env=.5+.5*sin(l*14.+u.y*2.+p*4.);vec3 ch=vec3(env)*vec3(.9,.92,1.)+pow(env,12.)*.6;return mix(o,vec4(ch,1.),smoothstep(.15,.7,b));}`, 'Liquid chrome', 'كروم سايل'],
    ['yOilPaint', 'blur', `vec4 tr(vec2 u){float b=sin(PI*p);float w=smoothstep(.4,.6,p);float an=fbm(u*4.)*6.2832;vec2 fl=vec2(cos(an),sin(an))*.006*b;vec4 s=vec4(0.);for(int i=0;i<8;i++)s+=mixAB(u+fl*(float(i)-3.5),w);s/=8.;
  s.rgb=floor(s.rgb*8.+.5)/8.;s.rgb*=mix(1.,.92+.08*vn(u*vec2(200.,180.)),b);return mix(mixAB(u,w),s,smoothstep(.1,.6,b));}`, 'Oil painting', 'لوحة زيت'],
    ['yInfrared', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec4 o=mixAB(u,smoothstep(.4,.6,p));vec3 c=o.rgb;vec3 ir=vec3(c.g*1.1+c.r*.3,c.r*.6+c.b*.2,c.b*.9+c.g*.1);
  ir=mix(ir,vec3(1.,.35,.55)*c.g*1.6,smoothstep(0.,.2,c.g-c.b));o.rgb=mix(c,ir,smoothstep(.1,.7,b));return o;}`, 'Infrared', 'أشعة تحت الحمرا'],
    ['yGameBoy', 'glitch', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 g=vec2(60.*AS(),60.);vec4 o=X((floor(u*g)+.5)/g,p);float q=floor(clamp(lu(o)*4.,0.,3.999));
  vec3 pal=q<.5?vec3(.06,.22,.06):q<1.5?vec3(.19,.38,.19):q<2.5?vec3(.55,.67,.06):vec3(.61,.74,.06);return mix(X(u,p),vec4(pal,1.),smoothstep(.15,.65,b));}`, 'Pocket game', 'جيم بوي'],
    ['yTeletext', 'glitch', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 g=vec2(40.,24.);vec2 c=floor(u*g),f=fract(u*g);vec2 sx=floor(f*vec2(2.,3.));vec4 o=X((c+(sx+.5)/vec2(2.,3.))/g,p);
  vec3 col=step(.45,o.rgb)*step(.25,lu(o));return mix(X(u,p),vec4(col,1.),smoothstep(.15,.65,b));}`, 'Teletext', 'تليتكست'],
    ['yMagnifier', 'shape', `vec4 tr(vec2 u){vec2 q=sq(u);float e=io(p);vec2 c=vec2(mix(-1.1,0.,e),sin(p*5.)*.15*(1.-e));float r=.18+e*e*1.2;float d=length(q-c);vec4 o=TA(u);
  if(d<r){vec2 m=c+(q-c)*mix(.55,1.,e*e);o=TB(m/vec2(AS(),1.)+.5);o.rgb*=1.+.15*(1.-d/r)*(1.-e);}o.rgb=mix(o.rgb,vec3(.2,.18,.15),smoothstep(.025,0.,abs(d-r))*(1.-smoothstep(.85,1.,p)));return o;}`, 'Magnifying glass', 'عدسة مكبرة'],
    ['yColorDrain', 'light', `vec4 tr(vec2 u){vec4 a=TA(u),c=TB(u);float dr=.02*sin(u.x*30.)+.015*sin(u.x*71.);float L1=1.05-clamp(p*2.,0.,1.)*1.1+dr,L2=-.05+clamp(p*2.-1.,0.,1.)*1.1+dr;
  vec3 A2=u.y>L1?vec3(lu(a)):a.rgb,B2=u.y<L2?c.rgb:vec3(lu(c));return vec4(mix(A2,B2,smoothstep(.42,.58,p)),1.);}`, 'Colour drains away', 'اللون بيصفّى'],
    ['yEclipse', 'light', `vec4 tr(vec2 u){vec2 q=sq(u);float b=sin(PI*p);float d=length(q-vec2(mix(-2.15,2.15,p),0.));vec4 o=X(u,p);float ins=1.-smoothstep(1.08,1.1,d);o.rgb*=1.-.96*ins;
  o.rgb+=vec3(1.,.9,.7)*exp(-max(d-1.1,0.)*7.)*(1.-ins)*b*.9;return o;}`, 'Eclipse', 'كسوف'],
    ['yRetroSun', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 q=sq(u);vec3 sky=mix(vec3(.15,.02,.25),vec3(.95,.3,.5),smoothstep(.5,-.1,q.y));vec3 col=sky;float sd=length(q-vec2(0.,.05));
  if(sd<.32&&q.y>0.){float h=q.y/.32;col=mix(vec3(1.,.85,.2),vec3(1.,.3,.5),1.-h);if(fract(q.y*22.-p*3.)<.3*(1.-h))col=sky;}
  if(q.y<0.){float z=.35/(-q.y+.02);vec2 gp=vec2(q.x*z,z+p*6.);float gl=max(smoothstep(.06,0.,abs(fract(gp.x)-.5)-.44),smoothstep(.06,0.,abs(fract(gp.y)-.5)-.44));col=vec3(.08,0.,.15)+vec3(1.,.2,.8)*gl*smoothstep(0.,.3,-q.y+.05);}
  return mix(mixAB(u,smoothstep(.45,.55,p)),vec4(col,1.),smoothstep(.2,.75,b));}`, 'Retro sunset', 'غروب ريترو'],
    ['yStopMotion', 'slide', `vec4 tr(vec2 u){float f=floor(p*8.)/8.;float e=io(f);float b=sin(PI*p);vec2 v=u+(vec2(h1(vec2(f,1.)),h1(vec2(f,2.)))-.5)*.015*b;float x=v.x+e;
  vec4 o=x<1.?TA(vec2(x,v.y)):TB(vec2(x-1.,v.y));o.rgb*=1.+(h1(vec2(f,4.))-.5)*.2*b;return o;}`, 'Stop motion', 'ستوب موشن'],
    ['yDoubleExposure', 'film', `vec4 tr(vec2 u){vec4 a=TA(u),c=TB(u);vec3 scr=1.-(1.-a.rgb)*(1.-c.rgb);vec3 m=mix(a.rgb,scr,smoothstep(0.,.5,p)*(1.-lu(a)*.8));return vec4(mix(m,c.rgb,smoothstep(.5,1.,p)),1.);}`, 'Double exposure', 'تعريض مزدوج'],
    ['yLaserShow', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec4 o=mixAB(u,smoothstep(.4,.6,p));o.rgb*=1.-.6*b;vec2 q=sq(u)-vec2(0.,-.6);float a=atan(q.x,q.y);float s=0.;
  for(int i=0;i<7;i++){float k=float(i);s+=smoothstep(.012,0.,abs(sin(a-(k-3.)*.22-sin(p*6.+k)*.25))*length(q));}o.rgb+=vec3(.2,1.,.4)*(s*1.4+.12*fbm(u*3.+p))*b;return o;}`, 'Laser show', 'عرض ليزر'],
    ['yHeadlights', 'light', `vec4 tr(vec2 u){float e=ei(p);float b=sin(PI*p);vec2 q=sq(u);float sp=.06+e*.9,r=.03+e*.8;float l=exp(-length(q-vec2(-sp,-.05))/r*2.)+exp(-length(q-vec2(sp,-.05))/r*2.);
  vec4 o=mixAB(u,smoothstep(.55,.7,p));o.rgb=o.rgb*(1.-.5*b*(1.-min(l,1.)))+vec3(1.,.97,.85)*l*1.4*b;o.rgb=mix(o.rgb,vec3(1.,.98,.92),exp(-pow((p-.62)*8.,2.)));return o;}`, 'Headlights', 'كشافات عربية'],
    ['ySparkler', 'mask', `vec2 pth(float t){return vec2(sin(t*9.)*.65,sin(t*13.+1.)*.38);}
vec4 tr(vec2 u){vec2 q=sq(u);float md=9.;for(int i=0;i<30;i++)md=min(md,length(q-pth(p*float(i)/29.)));vec4 o=X(u,step(md,.05+ei(p))*step(.001,p));
  float dh=length(q-pth(p));o.rgb+=vec3(1.,.8,.4)*(exp(-dh*40.)*3.+step(.92,h1(floor(u*R/2.)+floor(p*40.)))*exp(-dh*8.))*sin(PI*p);return o;}`, 'Sparkler', 'شمروخ'],
    ['yTinyPlanet', 'warp', `vec4 tr(vec2 u){float b=sin(PI*p);float k=smoothstep(.1,.7,b);vec2 q=sq(u);float a=atan(q.x,-q.y)+p*2.;vec2 pl=vec2(fract(.5+a/6.2832),clamp(length(q)/.75,0.,1.));
  vec4 o=X(mix(u,pl,k),p);o.rgb*=1.-.3*k*smoothstep(.7,.95,length(q)/.75);return o;}`, 'Tiny planet', 'كوكب صغير'],
    ['yExplodeTiles', 'slide', `vec4 tr(vec2 u){float e=ei(p);vec4 o=TB(u);o.rgb*=.6+.4*p;for(int i=0;i<40;i++){float k=float(i);vec2 c=vec2(mod(k,8.),floor(k/8.));vec2 cc=(c+.5)/vec2(8.,5.);
  vec2 dr=normalize(sq(cc)+(vec2(h1(c),h1(c+3.))-.5)*.3+1e-3)*(1.+h1(c+5.));vec2 ct=cc+dr*e*1.6;vec2 l=rc(u,ct,(h1(c+7.)-.5)*e*4.);vec2 f=(l-ct)/(1.-.5*e)*vec2(8.,5.)+.5;
  if(f.x>=0.&&f.x<1.&&f.y>=0.&&f.y<1.)o=TA((c+f)/vec2(8.,5.));}return o;}`, 'Tiles explode', 'مربعات بتتفرقع'],
    ['yAssemble', 'slide', `vec4 tr(vec2 u){vec4 o=TA(u);o.rgb*=1.-.4*sin(PI*p);for(int i=0;i<40;i++){float k=float(i);vec2 c=vec2(mod(k,8.),floor(k/8.));vec2 cc=(c+.5)/vec2(8.,5.);float t=clamp(p*1.6-h1(c+2.)*.6,0.,1.);
  float e=1.-eo(t);vec2 ct=cc+normalize(vec2(h1(c+5.),h1(c+9.))-.5+1e-3)*1.6*e;vec2 l=rc(u,ct,e*3.*(h1(c)-.5));vec2 f=(l-ct)*vec2(8.,5.)+.5;
  if(t>0.&&f.x>=0.&&f.x<1.&&f.y>=0.&&f.y<1.)o=TB((c+f)/vec2(8.,5.));}return o;}`, 'Tiles assemble', 'مربعات بتتجمع'],
    ['yBrochure', '3d', `vec4 tr(vec2 u){bool ph=p>=.5;float a=ph?PI*(2.-p*2.):PI*p*2.;bool mid=u.x>=1./3.&&u.x<=2./3.;vec4 o=mid?(ph?TB(u):TA(u)):bg(u);float c=cos(a);
  for(int k=0;k<2;k++){float hx=k==0?1./3.:2./3.;float sd=k==0?-1.:1.;if(abs(c)<1e-3)continue;float t=(u.x-hx)*sd/c;if(t>=0.&&t<=1./3.){vec2 x0=vec2(hx+sd*t,u.y);
  o=c>0.?(ph?TB(x0):TA(x0))*vec4(vec3(.55+.45*c),1.):vec4(vec3(.85,.84,.8)*(.55-.45*c),1.);}}return o;}`, 'Tri-fold', 'مطوية تلات طيات'],
    ['ySideBySide', 'slide', `vec4 tr(vec2 u){float e1=io(clamp(p/.45,0.,1.)),e2=io(clamp((p-.55)/.45,0.,1.));float s=mix(mix(1.,.48,e1),1.,e2);vec2 ca=vec2(mix(.5,.255,e1)-e2*.6,.5),cb=mix(vec2(mix(1.6,.745,e1),.5),vec2(.5),e2);
  vec2 a=.5+(u-ca)/s,c=.5+(u-cb)/s;vec4 o=vec4(vec3(.06),1.);if(inb(a))o=TA(a);if(inb(c))o=TB(c);return o;}`, 'Side by side', 'جنب بعض'],
    // ---- crafts, print and moving pieces
    ['yRibbon', 'mask', `vec4 tr(vec2 u){float yc=.5+.3*sin(u.x*6.-p*5.);float w=ei(p)*.85;float d=abs(u.y-yc)-w;vec4 o=X(u,step(d,0.)*step(.001,p));if(d<0.)o.rgb*=1.+.25*cos((u.y-yc)/max(w,.001)*3.)*(1.-p);
  o.rgb=mix(o.rgb,vec3(.95,.3,.4),smoothstep(.015,0.,abs(d))*sin(PI*p));return o;}`, 'Ribbon', 'شريطة'],
    ['yWiper', 'mask', `vec4 tr(vec2 u){vec2 q=sq(u)+vec2(0.,.55);float th=atan(q.x,q.y);float r=length(q);float sw=mix(-1.75,1.75,io(p));vec4 o=th<sw?TB(u):TA(u);
  if(th>=sw)o=mix(o,TA(u+.004),step(.93,h1(floor(u*R/3.)))*.6*sin(PI*p));float bd=abs(th-sw)*r;if(th<sw&&th>sw-.5)o.rgb*=1.+.18*smoothstep(.5,0.,sw-th)*pow(abs(sin(r*140.)),6.)*sin(PI*p);if(bd<.028&&r<1.25&&r>.1)o=vec4(vec3(.05+.12*step(bd,.008)),1.);if(length(q)<.07)o=vec4(vec3(.15),1.);return o;}`, 'Windscreen wiper', 'مساحة عربية'],
    ['yEnvelope', 'shape', `vec4 tr(vec2 u){vec2 q=abs(u-.5)*2.;float s=q.x+q.y;float L=2.*(1.-io(p));if(s>L)return TB(u);vec2 qm=q+(L-s);
  if(qm.x<=1.&&qm.y<=1.){vec4 o=TA(.5+sign(u-.5+1e-5)*qm*.5);o.rgb*=.7;return o;}vec4 o=TA(u);o.rgb*=1.-.3*exp(-(L-s)*20.)*sin(PI*p);return o;}`, 'Envelope', 'ظرف'],
    ['yBeadCurtain', 'slide', `vec4 tr(vec2 u){float b=sin(PI*p);float k=io(clamp((p-.4)/.6,0.,1.))*.75;float dx=u.x-.5;vec4 o=mixAB(u,smoothstep(.4,.55,p));if(abs(dx)<k)return o;float x0=u.x-sign(dx)*k;
  float c=floor(x0*36.);float f=fract(x0*36.)-.5+sin(u.y*7.+p*9.+c)*.08*b;float fy=fract(u.y*24.+c*.37)-.5;float d=length(vec2(f,fy*1.5));
  if(u.y>1.-eo(clamp(p/.35,0.,1.))*1.05&&d<.36){vec3 bd=mix(vec3(.75,.45,.2),vec3(1.,.9,.7),smoothstep(.2,0.,length(vec2(f+.12,fy*1.5-.12))));o.rgb=mix(o.rgb,bd*(1.-d),.9);}return o;}`, 'Bead curtain', 'ستارة خرز'],
    ['yPrintPress', 'film', `vec4 tr(vec2 u){float y=1.-u.y;vec3 col=vec3(1.);float l0=clamp(p/.25,0.,1.)*1.05,l1=clamp((p-.2)/.35,0.,1.)*1.05,l2=clamp((p-.35)/.35,0.,1.)*1.05,l3=clamp((p-.5)/.35,0.,1.)*1.05;float m=1.-p;
  if(y<l1)col.r=TB(u+vec2(.012,0.)*m).r;if(y<l2)col.g=TB(u+vec2(-.008,.01)*m).g;if(y<l3)col.b=TB(u+vec2(0.,-.012)*m).b;
  vec3 o=y<l0?col:TA(u).rgb;o*=1.-.4*smoothstep(.02,0.,abs(y-l0))*step(l0,1.);return vec4(o,1.);}`, 'Printing press', 'مطبعة'],
    ['yLineDraw', 'light', `vec4 tr(vec2 u){vec2 e=1.5/R;vec4 c=TB(u);float gx=lu(TB(u+vec2(e.x,0.)))-lu(TB(u-vec2(e.x,0.))),gy=lu(TB(u+vec2(0.,e.y)))-lu(TB(u-vec2(0.,e.y)));
  float ed=smoothstep(.06,.2,length(vec2(gx,gy)))*step(fbm(u*3.),p*1.8-.1);vec4 o=mix(TA(u),vec4(mix(vec3(.97,.96,.93),vec3(.12),ed),1.),smoothstep(0.,.3,p));return mix(o,c,smoothstep(.65,1.,p));}`, 'Line drawing', 'رسم خطوط'],
    ['yCartoon', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);float w=smoothstep(.4,.6,p);vec4 c=mixAB(u,w);vec2 e=1.5/R;float gx=lu(mixAB(u+vec2(e.x,0.),w))-lu(mixAB(u-vec2(e.x,0.),w)),gy=lu(mixAB(u+vec2(0.,e.y),w))-lu(mixAB(u-vec2(0.,e.y),w));
  vec3 ct=floor(c.rgb*4.+.5)/4.;ct=mix(vec3(lu(vec4(ct,1.))),ct,1.4);ct*=1.-smoothstep(.08,.25,length(vec2(gx,gy)));return mix(c,vec4(clamp(ct,0.,1.),1.),smoothstep(.15,.7,b));}`, 'Cartoon', 'كرتون'],
    ['yWatercolor', 'blur', `vec4 tr(vec2 u){float b=sin(PI*p);float n=fbm(u*4.);float w=smoothstep(.35,.65,p+(n-.5)*.3);vec2 v=u+(vec2(fbm(u*6.),fbm(u*6.+5.))-.5)*.02*b;vec4 s=mix(bA(v,.012),bB(v,.012),w);
  float m=fbm(u*8.);s.rgb=mix(s.rgb,vec3(1.),.15)*(1.-.1*smoothstep(.08,0.,abs(m-.5)))*(.95+.05*vn(u*300.));return mix(mixAB(u,smoothstep(.35,.65,p)),s,smoothstep(.15,.7,b));}`, 'Watercolour', 'ألوان مية'],
    ['yRomanMosaic', 'geo', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 g=vec2(45.*AS(),45.);vec2 c=floor(u*g);vec2 f=rot(fract(u*g)-.5,(h1(c)-.5)*.5);float t=.35+.3*h1(c+1.);vec4 col=p<t?TA((c+.5)/g):TB((c+.5)/g);
  vec3 r=mix(vec3(.75,.72,.65),col.rgb*(.9+.2*h1(c+2.)),step(max(abs(f.x),abs(f.y)),.4));return mix(X(u,p),vec4(r,1.),smoothstep(.2,.7,b));}`, 'Stone mosaic', 'موزاييك حجر'],
    ['yRiso', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);float w=smoothstep(.4,.6,p);float l1=lu(mixAB(u+vec2(.006,.003)*b,w)),l2=lu(mixAB(u-vec2(.005,.004)*b,w));
  float i1=step(h1(u*R+floor(p*12.)),(1.-l1)*.9),i2=step(h1(u*R+7.),(1.-l2)*.7);vec3 r=vec3(.96,.94,.88)*mix(vec3(1.),vec3(1.,.28,.55),i1)*mix(vec3(1.),vec3(.1,.45,.85),i2);
  return mix(mixAB(u,w),vec4(r,1.),smoothstep(.2,.7,b));}`, 'Riso print', 'طباعة ريزو'],
    ['yBacklight', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);float w=smoothstep(.4,.6,p);vec4 c=mixAB(u,w);float l=lu(c);vec4 gl=mix(bA(u,.03),bB(u,.03),w);
  vec3 r=l>.5?c.rgb*1.25+vec3(.25,.15,.05):vec3(.02,.02,.04);r+=vec3(1.,.7,.4)*max(lu(gl)-.4,0.)*1.4;return mix(c,vec4(r,1.),smoothstep(.15,.7,b));}`, 'Backlit', 'إضاءة من ورا'],
    ['yDayNight', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec4 o=mixAB(u,smoothstep(.4,.6,p));float l=lu(o);vec3 nt=o.rgb*vec3(.25,.35,.6)*.7;float hh=h1(floor(u*R/3.));
  nt+=vec3(1.,.8,.4)*step(.96,hh)*step(l,.4)*step(.3,fbm(u*8.))*(.6+.4*sin(p*40.+hh*20.));nt+=vec3(.9,.95,1.)*step(.997,h1(floor(u*R/2.)+3.))*step(.6,u.y);o.rgb=mix(o.rgb,nt,smoothstep(.1,.7,b));return o;}`, 'Day to night', 'من نهار لليل'],
    ['yDegauss', 'glitch', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 q=sq(u);float r=length(q);float wv=sin(r*25.-p*30.)*b;vec4 o=mixAB(u+normalize(q+1e-4)*wv*.01,smoothstep(.4,.6,p));
  float hs=wv*.5;o.rgb=mix(o.rgb,vec3(o.r*(1.+hs),o.g*(1.-abs(hs)),o.b*(1.-hs)),b);o.rgb+=vec3(sin(r*12.-p*20.),sin(r*12.-p*20.+2.),sin(r*12.-p*20.+4.))*.07*b*b;return o;}`, 'Degauss', 'شاشة بتترج ألوان'],
    ['yRainWipe', 'mask', `vec4 tr(vec2 u){float c=floor(u.x*90.);float st=h1(vec2(c,2.))*.5;float head=1.2-(p*1.6-st)*(.8+.8*h1(vec2(c,1.)))*1.3;float w=step(head,u.y)*step(st,p*1.6);
  vec4 o=X(u,w);o.rgb+=vec3(.7,.8,.9)*smoothstep(.15,0.,u.y-head)*step(head,u.y)*.4*sin(PI*p);return mix(o,TB(u),smoothstep(.85,1.,p));}`, 'Rain streaks', 'خطوط مطر'],
    ['yRollingBump', 'warp', `vec4 tr(vec2 u){vec2 q=sq(u);float cx=mix(-1.3,1.3,io(p));float dx=q.x-cx;float bp=exp(-dx*dx*10.);float sp=sin(PI*p);vec2 v=u-vec2(dx*bp*1.1*sp/AS(),0.);vec4 o=X(v,step(q.x,cx));o.r=X(v+vec2(.006*bp*sp,0.),step(q.x,cx)).r;o.rgb*=1.-.35*bp*smoothstep(.0,.3,abs(dx))*sp;o.rgb+=vec3(.8)*exp(-pow((dx+.08)*60.,2.))*sp*.7;return o;}`, 'Rolling lens', 'عدسة ماشية'],
    ['yWindowCascade', 'slide', `vec4 tr(vec2 u){vec4 o=TA(u);o.rgb*=1.-.3*sin(PI*p);float m=io(clamp((p-.62)/.38,0.,1.));for(int i=0;i<5;i++){float k=float(i);float t=clamp((p-.05-k*.12)/.12,0.,1.);if(t<=0.)continue;
  float s=.38+k*.06;vec2 c=vec2(.25+k*.09,.72-k*.08);float bar=.06;if(i==4){s=mix(s,1.,m);c=mix(c,vec2(.5),m);bar*=1.-m;}s*=mix(.8,1.,eo(t));vec2 a=.5+(u-c)/s;
  if(a.x>=0.&&a.x<=1.&&a.y>=0.&&a.y<=1.+bar)o=a.y>1.?vec4(.85,.86,.9,1.):TB(a);}return o;}`, 'Window cascade', 'شبابيك ورا بعض'],
    ['yRust', 'mask', `vec4 tr(vec2 u){float n=fbm(u*5.)*.7+fbm(u*22.)*.3;float t=p*1.7;vec4 a=TA(u);vec3 rc2=mix(vec3(.45,.2,.08),vec3(.75,.4,.15),fbm(u*40.))*(.6+.6*lu(a));
  a.rgb=mix(a.rgb,rc2,smoothstep(n-.1,n+.05,t-.15));vec4 o=step(n,t-.75)>0.?TB(u):a;o.rgb*=1.-.6*smoothstep(.04,0.,abs(n-(t-.75)))*step(.001,p)*(1.-p);return mix(o,TB(u),smoothstep(.9,1.,p));}`, 'Rust', 'صدا'],
    ['yOrigami', '3d', `vec4 tr(vec2 u){vec3 pp=vec3(.93,.92,.88);float s=p*4.;bool B=p>=.5;float a1=PI*io(B?clamp(4.-s,0.,1.):clamp(s,0.,1.)),a2=PI*io(B?clamp(3.-s,0.,1.):clamp(s-1.,0.,1.));vec4 o=bg(u);
  if(a2<1e-4){if(u.y<.5)o=B?TB(u):TA(u);float c=cos(a1);if(abs(c)>1e-3){float t=(u.y-.5)/c;if(t>=0.&&t<=.5){vec2 x0=vec2(u.x,.5+t);o=c>0.?(B?TB(x0):TA(x0))*vec4(vec3(.6+.4*c),1.):vec4(pp*(.6-.4*c),1.);}}}
  else{if(u.y<.5&&u.x<.5)o=vec4(pp*.9,1.);float c=cos(a2);if(u.y<.5&&abs(c)>1e-3){float t=(u.x-.5)/c;if(t>=0.&&t<=.5)o=vec4(pp*(.55+.45*abs(c)),1.);}}return o;}`, 'Origami fold', 'أوريجامي'],
    ['yTaps', 'mask', `vec4 tr(vec2 u){vec2 q=sq(u);float ins=0.,rg=0.;for(int i=0;i<3;i++){float k=float(i);vec2 c=(vec2(h1(vec2(k,3.)),h1(vec2(k,4.)))-.5)*vec2(1.2,.7);float r=max(p-.05-k*.2,0.)*3.6;float d=length(q-c)-r;
  if(r>0.&&d<0.)ins=1.;rg+=exp(-d*d*900.)*step(.0001,r);}vec4 o=X(u,ins);o.rgb+=vec3(.8,.9,1.)*min(rg,1.)*.5*sin(PI*p);return o;}`, 'Three taps', 'تلات لمسات'],
    ['yFrostedPanels', 'blur', `vec4 tr(vec2 u){float w=smoothstep(.45,.55,p);vec4 o=mixAB(u,w);for(int i=0;i<4;i++){float k=float(i);float x0=-.35-k*.3+p*(1.9+k*.3);if(u.x>x0&&u.x<x0+.3){vec4 f=mix(bA(u,.035),bB(u,.035),w);
  f.rgb=mix(f.rgb,vec3(.92,.95,1.),.15);f.rgb*=1.-.2*smoothstep(.27,.3,u.x-x0);o=f;}}return o;}`, 'Frosted panels', 'ألواح إزاز مصنفر'],
    ['ySpinTiles', 'geo', `vec4 tr(vec2 u){vec2 g=vec2(8.,5.);vec2 k=vec2(AS()*5./8.,1.);vec2 c=floor(u*g);vec2 f=(fract(u*g)-.5)*k;float t=clamp(p*1.6-(c.x+c.y)/11.*.6,0.,1.);float a=io(t)*PI;float s=1.-.35*sin(PI*t);
  bool B=a>PI*.5;vec2 l=rot(f,-(B?a-PI:a))/s/k+.5;if(!inb(l))return vec4(vec3(.05),1.);return B?TB((c+l)/g):TA((c+l)/g);}`, 'Spinning tiles', 'مربعات بتلف'],
    ['yTileShrink', 'geo', `vec4 tr(vec2 u){vec2 g=vec2(8.,5.);vec2 c=floor(u*g),f=fract(u*g)-.5;float t=clamp(p*1.5-h1(c)*.5,0.,1.);float s=abs(1.-2.*t);s=s*s*(3.-2.*s);vec2 l=f/max(s,.001)+.5;
  if(s<.001||!inb(l))return vec4(vec3(.05),1.);return t<.5?TA((c+l)/g):TB((c+l)/g);}`, 'Tiles shrink and grow', 'مربعات بتصغر وتكبر'],
    ['yFallingBlocks', 'slide', `vec4 tr(vec2 u){vec2 g=vec2(10.,6.);float cx=floor(u.x*g.x);vec4 o=TA(u);o.rgb*=1.-.35*sin(PI*p);for(int i=0;i<6;i++){float r=float(i);float T=.1+(r+h1(vec2(cx,r))*.9)/6.*.8;
  float y=(r+max(T-p,0.)*60.)/g.y;if(u.y>=y&&u.y<y+1./g.y){o=TB(vec2(u.x,r/g.y+(u.y-y)));if(p<T)o.rgb*=.9;}}return o;}`, 'Falling blocks', 'مكعبات بتقع'],
    ['yConcentric', 'geo', `vec4 tr(vec2 u){vec2 q=sq(u);float m=max(abs(q.x)/AS(),abs(q.y))*2.;float k=floor(m*7.);float t=clamp(p*1.7-(6.-k)*.1,0.,1.);float a=sin(PI*t)*PI*.25*(mod(k,2.)<1.?1.:-1.);
  vec2 v=rc(u,vec2(.5),-a);vec4 o=t<.5?TA(v):TB(v);o.rgb*=1.-.3*sin(PI*t)*smoothstep(.85,1.,fract(m*7.));return o;}`, 'Turning frames', 'براويز بتلف'],
    // ---- last set: tiles, signals and wrappings
    ['yPeelTiles', 'geo', `vec4 tr(vec2 u){vec2 g=vec2(8.,5.);vec2 c=floor(u*g),f=fract(u*g);float t=clamp(p*1.6-h1(c)*.6,0.,1.);float L=2.*(1.-io(t));float s=f.x+f.y;if(s>L)return TB(u);vec2 fm=f+(L-s);
  if(fm.x<=1.&&fm.y<=1.){vec4 o=TA((c+fm)/g);o.rgb=mix(o.rgb,vec3(.95),.5)*(.8+.2*(L-s));return o;}vec4 o=TA(u);o.rgb*=1.-.35*exp(-(L-s)*25.)*sin(PI*t);return o;}`, 'Peeling tiles', 'مربعات بتتقشر'],
    ['yPhoneRotate', 'cam', `vec4 tr(vec2 u){bool B=p>=.5;float a=B?-(1.-io(p*2.-1.))*PI*.5:io(p*2.)*PI*.5;float h=AS();float c=abs(cos(a)),sn=abs(sin(a));float s=min(h/(h*c+sn),1./(h*sn+c));
  vec2 k=vec2(h,1.);vec2 v=.5+rot((u-.5)*k,-a)/k/s;if(!inb(v))return vec4(vec3(.04),1.);return B?TB(v):TA(v);}`, 'Phone turn', 'لفة موبايل'],
    ['yTwirlTiles', 'geo', `vec4 tr(vec2 u){vec2 g=vec2(6.,4.);vec2 k=vec2(AS()*4./6.,1.);vec2 c=floor(u*g),f=(fract(u*g)-.5)*k;float t=clamp(p*1.5-h1(c)*.5,0.,1.);
  vec2 l=rot(f,sin(PI*t)*6.*smoothstep(.5,0.,length(f)))/k+.5;return t<.5?TA((c+l)/g):TB((c+l)/g);}`, 'Swirling tiles', 'دوامات صغيرة'],
    ['yFlyEye', 'warp', `vec4 tr(vec2 u){float b=sin(PI*p);float k=smoothstep(.15,.7,b);vec2 s=sq(u)*mix(1.,7.,k);s.x+=mod(floor(s.y),2.)*.5;vec2 f=fract(s)-.5;vec4 cell=X(f/vec2(AS(),1.)*1.1+.5,p);
  cell.rgb*=smoothstep(.5,.35,length(f));return mix(X(u,p),cell,k);}`, 'Fly eye', 'عين دبانة'],
    ['ySlidingPuzzle', 'geo', `vec4 tr(vec2 u){vec2 g=vec2(5.,3.);vec2 c=floor(u*g),f=fract(u*g);float r=2.-c.y;float i=r*5.+(mod(r,2.)<1.?c.x:4.-c.x);float T=.05+i/15.*.85;float e=io(clamp((p-T)/.06,0.,1.));
  vec4 o=TA(u);if(p>=T){float fx=f.x-(mod(r,2.)<1.?1.:-1.)*(1.-e);o=fx>=0.&&fx<=1.?TB((c+vec2(fx,f.y))/g):vec4(vec3(.05),1.);}
  o.rgb*=1.-.35*smoothstep(.04,0.,min(min(f.x,1.-f.x),min(f.y,1.-f.y)))*sin(PI*p);return o;}`, 'Sliding puzzle', 'لغز التزحليق'],
    ['yECG', 'light', `float ecg(float x){float f=fract(x*2.5);return exp(-pow((f-.3)*40.,2.))*.35-exp(-pow((f-.34)*60.,2.))*.12+exp(-pow((f-.5)*14.,2.))*.06;}
vec4 tr(vec2 u){float hx=mix(-.05,1.05,p);vec4 o=X(u,step(u.x,hx));float b=sin(PI*p);o.rgb=mix(o.rgb,vec3(.3,1.,.5),smoothstep(.008,0.,abs(u.y-.5-ecg(u.x)))*step(u.x,hx)*smoothstep(hx-.5,hx,u.x)*b);
  o.rgb+=vec3(.3,1.,.5)*exp(-length((u-vec2(hx,.5+ecg(hx)))*vec2(AS(),1.))*30.)*b;return o;}`, 'Heart monitor', 'رسم قلب'],
    ['ySoundWave', 'mask', `vec4 tr(vec2 u){float e=io(p);float wv=abs(sin(u.x*90.+p*40.))*.5+vn(vec2(u.x*30.,p*8.))*.5;float d=abs(u.y-.5)-e*(.55+.45*wv);vec4 o=X(u,step(d,0.)*step(.001,p));
  o.rgb+=vec3(.4,.8,1.)*smoothstep(.01,0.,abs(d))*sin(PI*p);return o;}`, 'Sound wave', 'موجة صوت'],
    ['yPieChart', 'shape', `vec4 tr(vec2 u){vec2 q=sq(u);float a=fract(atan(q.y,q.x)/6.2832+.25);float i=floor(a*6.);float t=clamp((p-i*.11)/.35,0.,1.);float bs=(i+.5)/6.*6.2832-1.5708;
  float d=length(q-vec2(cos(bs),sin(bs))*.06*sin(PI*t));vec4 o=X(u,step(d,bk(t))*step(.001,t));float ed=min(fract(a*6.),1.-fract(a*6.));o.rgb*=1.-.5*step(ed*d,.001)*sin(PI*p);return o;}`, 'Pie chart', 'رسم دايري'],
    ['yRasterBars', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec4 o=mixAB(u,smoothstep(.45,.55,p));o.rgb*=1.-.6*b;vec3 bars=vec3(0.);float cov=0.;for(int i=0;i<6;i++){float k=float(i);float d=abs(u.y-.5-.4*sin(p*7.+k*.55));
  if(d<.045){float s=1.-d/.045;bars=(.5+.5*cos(6.28*(k/6.+vec3(0.,.33,.67))))*s*1.2+pow(s,8.)*.5;cov=1.;}}return mix(o,vec4(bars,1.),cov*smoothstep(.1,.5,b)*.95);}`, 'Copper bars', 'بارات ريترو'],
    ['yRotozoom', 'cam', `vec4 tr(vec2 u){float b=sin(PI*p);float k=smoothstep(.2,.85,b);return X(rot(sq(u),k*(p-.5)*6.)*mix(1.,3.5,k*k)/vec2(AS(),1.)+.5,p);}`, 'Roto zoom', 'روتو زووم'],
    ['yFractal', 'mask', `vec4 tr(vec2 u){vec2 z=sq(u)*2.2;vec2 c=vec2(-.75+.1*sin(p*3.),.15);float n=0.;for(int i=0;i<40;i++){z=vec2(z.x*z.x-z.y*z.y,2.*z.x*z.y)+c;if(dot(z,z)>4.)break;n+=1.;}float d=.1+.8*n/40.;
  float w=wp(d,.08);vec4 o=mix(TA(u),TB(u),w);o.rgb+=(.5+.5*cos(6.28*(d*3.+vec3(0.,.33,.67))))*w*(1.-w)*2.5;return o;}`, 'Fractal', 'فراكتال'],
    ['ySeaWave', 'slide', `vec4 tr(vec2 u){float fx=mix(-.35,1.35,io(p))+.05*sin(u.y*12.+p*8.)+.03*sin(u.y*31.);float x=u.x;vec4 o=x<fx?TB(u+vec2(0.,sin(u.x*30.+p*10.)*.004*(1.-p))):TA(u);
  o.rgb=mix(o.rgb,vec3(.1,.45,.55)+.2*vn(u*vec2(20.,8.)+p*5.),smoothstep(fx-.3,fx,x)*step(x,fx)*.75);float fm=smoothstep(.04,0.,abs(x-fx+.01))*step(.4,vn(u*60.+p*10.));
  o.rgb=mix(o.rgb,vec3(.95),max(fm,smoothstep(.02,0.,abs(x-fx))*.8));return o;}`, 'Sea wave', 'موجة بحر'],
    ['yReflection', 'warp', `vec4 tr(vec2 u){float sy=p<.5?-1.:mix(-1.,1.,io((p-.5)*2.));float as=max(abs(sy),.02);float ry=.5+(u.y-.5)/as*sign(sy+1e-4);float dn=step(sy,0.);
  vec4 rb=TB(vec2(u.x+sin(u.y*40.+p*20.)*.008*(1.-p)*dn,ry));rb.rgb=mix(rb.rgb,rb.rgb*vec3(.7,.85,.95),dn);if(abs(ry-.5)>.5)rb=vec4(vec3(.04),1.);return mix(TA(u),rb,smoothstep(.05,.45,p));}`, 'Water reflection', 'انعكاس مية'],
    ['yBarberPole', 'light', `vec4 tr(vec2 u){float b=sin(PI*p);vec2 q=sq(u);float s=fract((q.x+q.y)*3.-p*4.);vec3 st=s<.33?vec3(.85,.1,.15):s<.5?vec3(.97):s<.83?vec3(.1,.25,.7):vec3(.97);
  return mix(mixAB(u,smoothstep(.45,.55,p)),vec4(st*(.55+.45*cos((u.x-.5)*2.6)),1.),smoothstep(.15,.6,b)*.92);}`, 'Barber pole', 'عمود حلاق'],
    ['yCautionTape', 'slide', `vec4 tr(vec2 u){vec2 q=sq(u);vec4 o=mixAB(u,smoothstep(.4,.6,p));for(int i=0;i<2;i++){vec2 n=i==0?normalize(vec2(1.,.4)):normalize(vec2(1.,-.5));float d=dot(q,n)-(i==0?mix(-1.7,1.7,p):mix(1.7,-1.7,p));
  if(abs(d)<.3){float st=step(.5,fract(dot(q,vec2(-n.y,n.x))*5.+d*5.));o=vec4(mix(vec3(1.,.82,.05),vec3(.06),st*step(abs(d),.22))*(1.-.25*smoothstep(.26,.3,abs(d))),1.);}}return o;}`, 'Caution tape', 'شريط تحذير'],
    ['yGiftWrap', 'shape', `vec4 tr(vec2 u){vec2 q=sq(u);float e=io(clamp((p-.35)/.65,0.,1.));float an=atan(q.y,q.x);float rr=e*1.3*(1.+.08*sin(an*9.)+.05*sin(an*23.));bool op=length(q)<rr&&e>0.;vec4 o=op?TB(u):TA(u);
  if(!op){float s=eo(clamp(p/.3,0.,1.));bool rv=abs(q.x)<.07&&u.y>1.-s*1.05,rh=abs(q.y)<.07&&u.x<s*1.05;if(rv||rh)o=vec4(vec3(.8,.08,.15)*(.75+.35*(1.-(rv?abs(q.x):abs(q.y))/.07)),1.);
  o.rgb*=1.-.4*smoothstep(.05,0.,length(q)-rr)*step(.001,e);}return o;}`, 'Gift unwrap', 'فك هدية'],
    ['yTileWave', 'geo', `vec4 tr(vec2 u){vec2 g=vec2(10.,6.);vec2 c0=floor(u*g);vec4 o=TA(u);float best=-1.;for(int i=-1;i<=1;i++)for(int j=-1;j<=1;j++){vec2 c=c0+vec2(float(i),float(j));vec2 cc=(c+.5)/g;float w=p*1.6-(cc.x+cc.y)*.4;
  float h=exp(-pow((w-.3)*6.,2.));vec2 f=(u-cc)*g/(1.+.4*h)+.5;if(f.x>=0.&&f.x<=1.&&f.y>=0.&&f.y<=1.&&h>best){best=h;o=w>.3?TB((c+f)/g):TA((c+f)/g);o.rgb*=1.+.2*h;}}return o;}`, 'Tile wave', 'موجة مربعات'],
];
  const CATS = ['cam', 'blur', 'glitch', 'light', 'film', 'shape', '3d', 'mask', 'slide', 'warp', 'geo'];
  const MAIN = '\nvoid main(){R=(D>.5&&D<1.5)||D>2.5?RR.yx:RR;gl_FragColor=tr(dfwd(uv0));}';
  // easing of the transition's progress (all stay inside 0..1, which every shader expects)
  const EASES = ['lin', 'smooth', 'hit', 'soft', 'bounce', 'short'];
  const bounce = x => x < 1 / 2.75 ? 7.5625 * x * x : x < 2 / 2.75 ? 7.5625 * (x -= 1.5 / 2.75) * x + .75 : x < 2.5 / 2.75 ? 7.5625 * (x -= 2.25 / 2.75) * x + .9375 : 7.5625 * (x -= 2.625 / 2.75) * x + .984375;
  const ease = (k, q) => { q = Math.min(1, Math.max(0, q));
    return k === 'smooth' ? q * q * (3 - 2 * q) : k === 'hit' ? 1 - (1 - q) ** 3 : k === 'soft' ? q * q : k === 'bounce' ? bounce(q) : k === 'short' ? Math.min(1, Math.max(0, (q - .25) * 2)) : q; };
  const api = { HEAD, MAIN, EASES, ease, LIST, CATS, ids: LIST.map(x => x[0]), cat: Object.fromEntries(LIST.map(x => [x[0], x[1]])) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MaqtoGLT = api;
})(this);
