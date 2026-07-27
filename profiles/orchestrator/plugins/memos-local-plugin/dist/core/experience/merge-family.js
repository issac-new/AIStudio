export function deriveMergeFamily(input) {
    if (input.inducedBy.startsWith("l2.induction"))
        return "success_induction";
    if (input.experienceType === "failure_avoidance" || input.evidencePolarity === "negative") {
        return "failure_avoidance";
    }
    return "failure_corrective";
}
//# sourceMappingURL=merge-family.js.map