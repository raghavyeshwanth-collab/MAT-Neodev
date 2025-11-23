from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import io
import soundfile as sf
import librosa

app = Flask(__name__)
CORS(app)


def compute_spectral_flatness(mags):
    """Compute spectral flatness (geometric mean / arithmetic mean)"""
    eps = 1e-12
    mags = np.maximum(mags, eps)
    geometric_mean = np.exp(np.mean(np.log(mags)))
    arithmetic_mean = np.mean(mags)
    flatness = geometric_mean / (arithmetic_mean + eps)
    return np.clip(flatness, 0, 1)


def analyze_audio_features(waveform, sr):
    """Extract audio features for environmental scoring"""
    
    # Convert to mono if stereo
    if waveform.ndim > 1:
        waveform = np.mean(waveform, axis=1)
    
    # Take first ~16k samples for analysis
    SAMPLE_COUNT = 16384
    waveform = waveform[:SAMPLE_COUNT]
    
    # Compute RMS
    rms = np.sqrt(np.mean(waveform ** 2))
    
    # Apply Hann window
    window = np.hanning(len(waveform))
    windowed = waveform * window
    
    # Pad to next power of 2
    fft_size = 2 ** int(np.ceil(np.log2(len(windowed))))
    padded = np.zeros(fft_size)
    padded[:len(windowed)] = windowed
    
    # Compute FFT
    fft = np.fft.rfft(padded)
    mags = np.abs(fft)
    
    # Frequency bins
    freqs = np.fft.rfftfreq(fft_size, 1.0 / sr)
    
    # Energy in frequency bands
    low_mask = freqs < 300
    mid_mask = (freqs >= 300) & (freqs < 3000)
    high_mask = freqs >= 3000
    
    energy = mags ** 2
    total_energy = np.sum(energy) + 1e-12
    
    low_ratio = np.sum(energy[low_mask]) / total_energy
    mid_ratio = np.sum(energy[mid_mask]) / total_energy
    high_ratio = np.sum(energy[high_mask]) / total_energy
    
    # Spectral centroid
    centroid = np.sum(freqs * mags) / (np.sum(mags) + 1e-12)
    
    # Spectral flatness
    flatness = compute_spectral_flatness(mags)
    
    # Low frequency peakiness
    low_mags = mags[low_mask]
    if len(low_mags) > 0:
        low_mean = np.mean(low_mags)
        low_max = np.max(low_mags)
        low_peakiness = low_max / (low_mean + 1e-12)
    else:
        low_peakiness = 1.0
    
    return {
        'rms': float(rms),
        'lowRatio': float(low_ratio),
        'midRatio': float(mid_ratio),
        'highRatio': float(high_ratio),
        'centroid': float(centroid),
        'flatness': float(flatness),
        'lowPeakiness': float(low_peakiness)
    }


def compute_environmental_score(features):
    """Compute environmental score using pattern matching for marine sounds"""
    
    rms = features['rms']
    lowRatio = features['lowRatio']
    midRatio = features['midRatio']
    highRatio = features['highRatio']
    centroid = features['centroid']
    flatness = features['flatness']
    lowPeakiness = features['lowPeakiness']
    
    score = 50  # Start at neutral
    
    # HUMPBACK WHALE SIGNATURE (max ~35 points)
    humpback_score = 0
    if lowRatio > 0.6:
        humpback_score += 10
    if lowRatio > 0.5:
        humpback_score += 6
    if flatness < 0.2:
        humpback_score += 12
    elif flatness < 0.3:
        humpback_score += 8
    if lowPeakiness > 3.5:
        humpback_score += 10
    elif lowPeakiness > 2.5:
        humpback_score += 6
    if centroid < 1000:
        humpback_score += 8
    elif centroid < 1500:
        humpback_score += 5
    if midRatio < 0.3:
        humpback_score += 5
    
    # ORCA/KILLER WHALE SIGNATURE (max ~35 points)
    orca_score = 0
    if 0.15 < highRatio < 0.4:
        orca_score += 10
    if 0.25 < flatness < 0.55:
        orca_score += 8
    if 0.25 < midRatio < 0.5:
        orca_score += 8
    if 0.2 < lowRatio < 0.6:
        orca_score += 7
    if 1000 < centroid < 3000:
        orca_score += 8
    if 1.5 < lowPeakiness < 4:
        orca_score += 5
    if 0.01 < rms < 0.08:
        orca_score += 5
    
    # BOAT/ENGINE SIGNATURE (HEAVY PENALTIES)
    boat_score = 0
    
    # Critical boat indicators
    is_boat = (
        (flatness > 0.5) or
        (centroid > 2000 and lowPeakiness < 2.5) or
        (midRatio > 0.4 and flatness > 0.45) or
        (rms > 0.08)
    )
    
    if is_boat:
        # Heavy penalties for boat sounds
        if flatness > 0.7:
            boat_score -= 60
        elif flatness > 0.6:
            boat_score -= 50
        elif flatness > 0.5:
            boat_score -= 40
        elif flatness > 0.4:
            boat_score -= 30
        
        if centroid > 4000:
            boat_score -= 40
        elif centroid > 3000:
            boat_score -= 35
        elif centroid > 2500:
            boat_score -= 30
        elif centroid > 2000:
            boat_score -= 20
        
        if lowPeakiness < 1.5:
            boat_score -= 30
        elif lowPeakiness < 2.0:
            boat_score -= 25
        elif lowPeakiness < 2.5:
            boat_score -= 15
        
        if midRatio > 0.5:
            boat_score -= 30
        elif midRatio > 0.4:
            boat_score -= 20
        
        if highRatio > 0.35:
            boat_score -= 25
        
        if rms > 0.15:
            boat_score -= 30
        elif rms > 0.1:
            boat_score -= 20
        elif rms > 0.08:
            boat_score -= 10
    
    # Combine scores
    animal_score = max(humpback_score, orca_score)
    score += animal_score + boat_score
    
    # Cap score at 30 if boat detected
    if is_boat and score > 30:
        score = min(30, score)
    
    # Cap marine animal scores to keep them in 80-95 range (not 100)
    if not is_boat and score > 95:
        score = 95
    
    # Clamp to 0-100
    score = int(np.clip(score, 0, 100))
    
    # Determine note based on ranges
    if score >= 80:
        note = "High: Strong marine mammal vocalizations detected (healthy environment)."
    elif score >= 40:
        note = "Medium: Moderate marine activity or mixed signals with some noise."
    else:
        note = "Low: Significant pollution (boat/engine noise) or minimal biological activity."
    
    return {
        'score': score,
        'note': note,
        'humpbackScore': humpback_score,
        'orcaScore': orca_score,
        'boatPenalty': boat_score,
        'isBoat': is_boat
    }


@app.route("/analyze", methods=["POST"])
def analyze():
    if "file" not in request.files:
        return jsonify({"error": "no file"}), 400

    f = request.files["file"]
    data = f.read()

    try:
        arr, sr = sf.read(io.BytesIO(data), dtype='float32')
    except Exception as e:
        return jsonify({"error": "cannot decode audio", "detail": str(e)}), 400

    if arr.size == 0:
        return jsonify({"error": "empty audio"}), 400

    # Extract features
    features = analyze_audio_features(arr, sr)
    
    # Compute score
    result = compute_environmental_score(features)
    
    # Combine features and score
    response = {
        **result,
        **features
    }
    
    return jsonify(response)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)