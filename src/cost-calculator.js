export function calculateAndLogCost(usage) {
    if (!usage) return;

    let totalCost = 0;
    let detailLog = [];

    const calculate = (details, isInput) => {
        if (!details) return;
        details.forEach(d => {
            let rate = 0;
            if (isInput) {
                if (d.modality === "TEXT") rate = 0.50;
                else if (d.modality === "AUDIO" || d.modality === "IMAGE" || d.modality === "VIDEO") rate = 3.00;
            } else {
                if (d.modality === "TEXT") rate = 2.00;
                else if (d.modality === "AUDIO") rate = 12.00;
            }
            const cost = (d.tokenCount / 1000000) * rate;
            totalCost += cost;
            detailLog.push(`${isInput ? 'Input' : 'Output'} (${d.modality}): ${d.tokenCount} tokens * $${rate}/1M = $${cost.toFixed(6)}`);
        });
    };

    calculate(usage.promptTokensDetails, true);
    calculate(usage.responseTokensDetails, false);

    if (usage.thoughtsTokenCount) {
        const rate = 2.00;
        const cost = (usage.thoughtsTokenCount / 1000000) * rate;
        totalCost += cost;
        detailLog.push(`Output (THOUGHTS): ${usage.thoughtsTokenCount} tokens * $${rate}/1M = $${cost.toFixed(6)}`);
    }

    // console.log("--- Cost Calculation ---");
    // detailLog.forEach(l => console.log(l));
    // console.log(`Total Cost: $${totalCost.toFixed(6)}, ${Math.round(totalCost * 1500)}원`);

    // Calculate totals for easy access
    let inputTokens = 0;
    let inputCost = 0;
    let outputTokens = 0;
    let outputCost = 0;

    if (usage.promptTokensDetails) {
        usage.promptTokensDetails.forEach(d => {
            inputTokens += d.tokenCount;
            // Simplified rate calculation for summary (using average or dominant if complex, but here we can just sum)
            let rate = 0;
            if (d.modality === "TEXT") rate = 0.50;
            else rate = 3.00; // AUDIO/IMAGE/VIDEO
            inputCost += (d.tokenCount / 1000000) * rate;
        });
    }

    if (usage.responseTokensDetails) {
        usage.responseTokensDetails.forEach(d => {
            outputTokens += d.tokenCount;
            let rate = 0;
            if (d.modality === "TEXT") rate = 2.00;
            else rate = 12.00; // AUDIO
            outputCost += (d.tokenCount / 1000000) * rate;
        });
    }

    // Handle thoughts if present (Output)
    if (usage.thoughtsTokenCount) {
        outputTokens += usage.thoughtsTokenCount;
        outputCost += (usage.thoughtsTokenCount / 1000000) * 2.00;
    }

    return {
        input: { tokens: inputTokens, cost: inputCost },
        output: { tokens: outputTokens, cost: outputCost },
        total: { cost: totalCost }
    };
}
