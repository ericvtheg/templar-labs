"""Generate Web DAW's original, deterministic, MIT-licensed one-shot library."""
import math
import pathlib
import random
import struct
import wave

out = pathlib.Path(__file__).resolve().parents[1] / "apps/web/public/samples"
out.mkdir(parents=True, exist_ok=True)
rate = 22050
for group in range(8):
    for variant in range(8):
        rng = random.Random(group * 100 + variant)
        duration = [.65, .28, .25, .12, .6, .3, .6, .9][group] * (1 + variant * .04)
        data = []
        low = 0
        phase = 0
        for i in range(int(rate * duration)):
            t = i / rate
            noise = rng.uniform(-1, 1)
            low = low * .85 + noise * .15
            pitch = 1 + (variant - 3) * .08
            if group == 0:
                frequency = (45 + 125 * math.exp(-t * 40)) * pitch
                phase += 2 * math.pi * frequency / rate
                value = math.sin(phase) * math.exp(-t * (7 + variant)) + noise * math.exp(-t * 180) * .2
            elif group == 1:
                value = (noise-low) * math.exp(-t*22) * .65 + math.sin(2*math.pi*180*pitch*t) * math.exp(-t*35) * .35
            elif group == 2:
                envelope = sum(math.exp(-(t-start)*70) if t >= start else 0 for start in [0,.012,.025,.038])
                value = (noise-low) * envelope * .3
            elif group in (3,4):
                value = (noise-low) * math.exp(-t*(65 if group == 3 else 10)) * .6
                value += sum(math.sin(2*math.pi*f*pitch*t) for f in [4100,5320,6890]) * .035 * math.exp(-t*25)
            elif group == 5:
                value = (math.sin(2*math.pi*780*pitch*t)+math.sin(2*math.pi*1130*pitch*t)) * .3 * math.exp(-t*30) + noise * .13 * math.exp(-t*45)
            elif group == 6:
                phase += 2*math.pi*(90+variant*17+120*math.exp(-t*35))/rate
                value = math.sin(phase)*math.exp(-t*12)
            else:
                phase += 2*math.pi*(300+1600*t/duration)*pitch/rate
                value = (math.sin(phase)*.3+(noise-low)*.4)*math.sin(math.pi*t/duration)**2 * (1-t/duration)
            value *= min(1, i/20) * min(1, (rate*duration-i)/100)
            if variant == 5:
                value = round(value*16)/16
            data.append(value)
        peak = max(abs(x) for x in data) or 1
        with wave.open(str(out / f"{group}-{variant}.wav"), "wb") as file:
            file.setparams((1,2,rate,0,"NONE","not compressed"))
            file.writeframes(b"".join(struct.pack("<h",int(x/peak*28000)) for x in data))
print("Generated 64 original samples")
