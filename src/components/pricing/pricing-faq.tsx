import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PRO_PRICING, formatUsd } from "./pricing-config";

const faqs = [
  {
    value: "free",
    question: "What can I do on the Free plan?",
    answer:
      "Take every free course in full, try the free preview lessons of Pro courses, and track your progress. No card required.",
  },
  {
    value: "yearly",
    question: "How does yearly billing work?",
    answer: `Yearly is ${formatUsd(PRO_PRICING.yearly)} instead of ${formatUsd(PRO_PRICING.monthly * 12)}: ten months for the price of twelve.`,
  },
  {
    value: "cancel",
    question: "Can I cancel any time?",
    answer:
      "Yes. Manage or cancel your subscription from your account; you keep Pro until the end of the period you paid for.",
  },
  {
    value: "tutor",
    question: "What does the AI tutor do?",
    answer:
      "It lives in the corner of every page, knows which lesson you are on and what you have finished, suggests what to do next and quizzes you. It is included with Pro.",
  },
  {
    value: "progress",
    question: "What happens to my progress if I downgrade?",
    answer:
      "Your progress is always kept. Pro lessons lock again, except free previews, and unlock when you resubscribe.",
  },
];

export function PricingFaq() {
  return (
    <Accordion aria-label="Frequently asked questions" className="bg-surface">
      {faqs.map((faq) => (
        <AccordionItem key={faq.value} value={faq.value}>
          <AccordionHeader render={<h3 />}>
            <AccordionTrigger>{faq.question}</AccordionTrigger>
          </AccordionHeader>
          <AccordionPanel>
            <p>{faq.answer}</p>
          </AccordionPanel>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
