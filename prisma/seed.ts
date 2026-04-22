import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.reminderJob.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.availabilityException.deleteMany();
  await prisma.availabilityRule.deleteMany();
  await prisma.testimonial.deleteMany();
  await prisma.blogPost.deleteMany();
  await prisma.service.deleteMany();
  await prisma.client.deleteMany();

  const client = await prisma.client.create({
    data: {
      name: "Annette Rodriguez Nathan",
      aboutMe:
        "Annette Rodriguez Nathan is a Craniosacral Therapy practitioner and Integrative Manual Therapist with over three decades of experience in hands-on, trauma-aware care. Her sessions support nervous system regulation, deep rest, and the body's natural capacity to heal through subtle, attentive, and highly skilled work. She practices listening to one's Inner Physician which often produces great insight, healing and somatic emotional release.\n\nAnnette is known for a calm, deeply responsive presence and a therapeutic approach grounded in safety, choice, and careful listening. Clients often seek her care for chronic pain, nervous system dysregulation, trauma recovery, mobility restrictions, and periods of physical or emotional overwhelm.\n\nHer background includes extensive training in advanced Craniosacral Therapy, Somatic Emotional Release, pediatrics and infant Craniosacral Therapy, the enteric nervous system and microbiome, the immune system, and the integration of acupuncture meridians within craniosacral work. She has also studied Hawaiian Lomilomi, Thai Yoga Massage, Reflexology, and Huna psychospiritual principles, all of which contribute to the depth and sensitivity of her practice.\n\nAnnette's work emphasizes subtle perception, parasympathetic regulation, vagus nerve support, and the quiet shifts that help clients feel more settled, resourced, and at home in their bodies. Her approach is client centered, consent based, and deeply respectful of the body's intelligence. In addition to her clinical work, Annette is a Certified Master Circle Facilitator. Her women's circles are trauma-aware spaces that support women in reclaiming personal power, voice, community-aware guidance and ritual, and sovereignty.",
      email: "onenessbody1@gmail.com",
      services: {
        create: [
          {
            title: "Somatic Emotional Release (60 minutes)",
            description:
              "Online somatic emotional release work using craniosacral therapy remote techniques. Focused support for nervous system regulation, deep rest, and guided release.",
            price: 140.0,
            durationMinutes: 60,
            bufferMinutes: 15,
            isPublished: true,
          },
          {
            title: "Somatic Emotional Release (90 minutes)",
            description:
              "Extended online somatic emotional release work using craniosacral therapy remote techniques for deeper integration and therapeutic restoration.",
            price: 200.0,
            durationMinutes: 90,
            bufferMinutes: 15,
            isPublished: true,
          },
          {
            title: "Sistership Circle Session",
            description:
              "Online and live circle sessions designed as trauma-aware spaces for support, ritual, energetic resetting, and community guidance. Sliding scale offering.",
            price: 25.0,
            durationMinutes: 90,
            bufferMinutes: 15,
            isPublished: true,
          },
        ],
      },
    },
    include: {
      services: true,
    },
  });

  // Mon-Fri, 9:00am-5:00pm MST
  await prisma.availabilityRule.createMany({
    data: [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      startMinutes: 9 * 60,
      endMinutes: 17 * 60,
      timezone: "MST",
      isActive: true,
      clientId: client.id,
    })),
  });

  const firstService = client.services[0];
  const sampleStart = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const sampleEnd = new Date(sampleStart.getTime() + (firstService.durationMinutes + firstService.bufferMinutes) * 60_000);

  await prisma.appointment.create({
    data: {
      clientFirstName: "Sample",
      clientLastName: "Client",
      email: "sample.client@example.com",
      phone: "+15555551234",
      date: sampleStart,
      endDate: sampleEnd,
      timezone: "MST",
      serviceId: firstService.id,
      states: "pending",
      paymentStatus: "pending",
      paymentMethod: "credit_card",
    },
  });

  console.log("Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });