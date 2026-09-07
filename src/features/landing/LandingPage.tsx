import { useState } from 'react';
import { Link } from 'react-router-dom';

import { DemoFlow } from './DemoFlow';
import { ButtonLink } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import { useSeo } from '@/lib/seo';

/**
 * Página comercial.
 *
 * Aqui o produto se apresenta a donos de restaurante, não a clientes com fome.
 * O argumento central é um número: quem vê o prato antes pede mais. Por isso a
 * demonstração do fluxo QR → cardápio → produto → AR → pedido vem logo depois
 * da dobra, antes de qualquer lista de recursos.
 */

const DEMO_SLUG = 'brasa-e-mesa';

const PLANS = [
  {
    code: 'basico',
    name: 'Básico',
    priceCents: 9900,
    pitch: 'Para quem quer trocar o cardápio de papel por um QR Code.',
    features: ['Cardápio digital ilimitado', 'QR Code geral e por mesa', 'Pedidos na mesa', '1 usuário'],
    highlighted: false,
  },
  {
    code: 'pro',
    name: 'Pro',
    priceCents: 24900,
    pitch: 'Para quem quer vender mais com realidade aumentada.',
    features: [
      'Tudo do Básico',
      'Realidade aumentada em escala real',
      'Modelos 3D por produto',
      'Analytics e funil de conversão',
      '3 usuários',
    ],
    highlighted: true,
  },
  {
    code: 'premium',
    name: 'Premium',
    priceCents: 49900,
    pitch: 'Para redes com mais de uma unidade.',
    features: [
      'Tudo do Pro',
      'Identidade visual personalizada',
      'Múltiplas unidades',
      'Usuários ilimitados',
      'Suporte dedicado',
    ],
    highlighted: false,
  },
];

const FAQ = [
  {
    question: 'O cliente precisa instalar algum aplicativo?',
    answer:
      'Não. Tudo acontece no navegador do celular. O cliente aponta a câmera para o QR Code, o cardápio abre, e a realidade aumentada usa a própria câmera do aparelho.',
  },
  {
    question: 'Funciona em qualquer celular?',
    answer:
      'A realidade aumentada imersiva funciona na maioria dos Android recentes com Chrome. No iPhone, usamos o visualizador nativo da Apple quando o prato tem arquivo USDZ. Em qualquer outro aparelho, o cliente vê o prato num visualizador 3D interativo, com as dimensões reais e o botão de pedir. Nenhum cliente encontra tela quebrada.',
  },
  {
    question: 'Quem faz os modelos 3D dos pratos?',
    answer:
      'Você envia o arquivo GLB pelo painel e informa as medidas reais do prato. A plataforma calcula a escala para que ele apareça em tamanho aproximado 1:1 na mesa. Se preferir, nossa equipe produz os modelos dos seus pratos principais.',
  },
  {
    question: 'Os pedidos vão para o meu sistema?',
    answer:
      'Os pedidos chegam ao painel em tempo real, identificados por mesa, com o fluxo recebido → confirmado → em preparo → pronto → entregue. A integração com sistemas de PDV e o pagamento online estão previstos na arquitetura e entram nas próximas versões.',
  },
  {
    question: 'Quanto tempo leva para começar?',
    answer:
      'Cadastrar as categorias e os pratos leva uma tarde. Os QR Codes saem prontos para impressão no mesmo dia. Os modelos 3D podem entrar depois, prato a prato, sem parar o cardápio.',
  },
];

export default function LandingPage() {
  useSeo({
    title: 'AR Menu — seu cliente vê o prato antes de pedir',
    description:
      'Transforme seu cardápio digital em uma experiência interativa com realidade aumentada. QR Code por mesa, pedidos e métricas de conversão.',
    canonicalPath: '/',
    structuredData: {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'AR Menu',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description:
        'Plataforma de cardápio digital com realidade aumentada para restaurantes.',
      offers: PLANS.map((plan) => ({
        '@type': 'Offer',
        name: plan.name,
        price: (plan.priceCents / 100).toFixed(2),
        priceCurrency: 'BRL',
      })),
    },
  });

  return (
    <div className="min-h-dvh bg-paper">
      <SiteHeader />
      <Hero />
      <Problem />
      <DemoSection />
      <HowItWorks />
      <ARSection />
      <QrSection />
      <DashboardSection />
      <Plans />
      <Faq />
      <FinalCta />
      <SiteFooter />
    </div>
  );
}

/* ========================================================================== */

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-paper/92 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="h-px w-6 ember-rule" aria-hidden />
          <span className="font-display text-[18px]">AR Menu</span>
        </Link>

        <nav className="ml-auto hidden items-center gap-6 text-[14px] text-muted md:flex">
          <a href="#como-funciona" className="hover:text-ink">Como funciona</a>
          <a href="#ar" className="hover:text-ink">Realidade aumentada</a>
          <a href="#planos" className="hover:text-ink">Planos</a>
          <a href="#faq" className="hover:text-ink">Dúvidas</a>
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link to="/admin/entrar" className="px-2 text-[14px] text-muted hover:text-ink">
            Entrar
          </Link>
          <ButtonLink to="/admin/cadastro" size="sm">
            Testar grátis
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}

/**
 * Hero.
 *
 * A tese da página não é uma frase: é o próprio fluxo do produto rodando ao
 * lado da promessa. Um mockup estático de celular seria a resposta genérica.
 */
function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-16 pt-14 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pt-20">
      <div>
        <p className="flex items-center gap-2 text-[13px] font-medium uppercase tracking-[0.1em] text-muted">
          <span className="h-px w-6 ember-rule" aria-hidden />
          Cardápio digital com AR
        </p>

        <h1 className="mt-5 font-display text-[clamp(2.4rem,6.5vw,4rem)] leading-[1.02]">
          Seu cliente vê o prato antes de pedir.
        </h1>

        <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-ink-soft">
          Transforme seu cardápio digital em uma experiência interativa com realidade aumentada. O
          prato aparece na mesa, em tamanho real, pela câmera do celular — sem instalar aplicativo.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink to="/admin/cadastro" variant="ember" size="lg">
            Testar 14 dias grátis
          </ButtonLink>
          <ButtonLink to={`/r/${DEMO_SLUG}`} variant="outline" size="lg">
            Ver cardápio de demonstração
          </ButtonLink>
        </div>

        <dl className="mt-10 flex flex-wrap gap-8 border-t border-hairline pt-6">
          {[
            ['1:1', 'escala real na mesa'],
            ['0', 'aplicativos para instalar'],
            ['1 tarde', 'para publicar o cardápio'],
          ].map(([value, label]) => (
            <div key={label}>
              <dt className="tabular font-display text-[26px] leading-none">{value}</dt>
              <dd className="mt-1 text-[13px] text-muted">{label}</dd>
            </div>
          ))}
        </dl>
      </div>

      <DemoFlow />
    </section>
  );
}

function Problem() {
  const items = [
    {
      title: 'A foto não conta o tamanho',
      body: 'A porção parecia maior na imagem. O cliente reclama, o garçom explica, a experiência começa errada.',
    },
    {
      title: 'A dúvida trava o pedido',
      body: '“Serve para dois?” é a pergunta mais feita na mesa. Enquanto ela não é respondida, o pedido não sai.',
    },
    {
      title: 'O cardápio de papel não mede nada',
      body: 'Você não sabe qual prato foi mais visto, qual foi ignorado, nem onde o cliente desistiu.',
    },
  ];

  return (
    <section className="border-y border-hairline bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="max-w-2xl font-display text-[clamp(1.8rem,4vw,2.6rem)] leading-tight">
          O cliente decide com a informação que tem. Hoje, ela é uma foto e um preço.
        </h2>

        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          {items.map((item) => (
            <div key={item.title}>
              <h3 className="font-display text-[19px]">{item.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DemoSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16" id="demonstracao">
      <div className="max-w-2xl">
        <h2 className="font-display text-[clamp(1.8rem,4vw,2.6rem)] leading-tight">
          Do adesivo na mesa ao pedido na cozinha
        </h2>
        <p className="mt-3 text-[16px] leading-relaxed text-muted">
          Cinco toques separam o cliente sentado do pedido enviado. Nenhum deles exige download,
          cadastro ou explicação do garçom.
        </p>
      </div>

      <ol className="mt-10 grid gap-px overflow-hidden rounded-[10px] border border-hairline bg-hairline sm:grid-cols-5">
        {[
          ['QR Code', 'Aponta a câmera para o adesivo da mesa.'],
          ['Cardápio', 'O menu abre já sabendo em qual mesa ele está.'],
          ['Produto', 'Foto, ingredientes, alergênicos e preço.'],
          ['Realidade aumentada', 'O prato aparece na mesa, em tamanho real.'],
          ['Pedido', 'Vai direto para a cozinha, identificado.'],
        ].map(([title, body], index) => (
          <li key={title} className="bg-paper p-5">
            <span className="tabular font-mono text-[12px] text-faint">
              {String(index + 1).padStart(2, '0')}
            </span>
            <h3 className={cn('mt-2 font-display text-[18px]', index === 3 && 'ember-text')}>
              {title}
            </h3>
            <p className="mt-1.5 text-[14px] leading-snug text-muted">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      title: 'Cadastre o prato',
      body: 'Nome, descrição, ingredientes, alergênicos, preço e foto. Tudo em uma tela só.',
    },
    {
      title: 'Envie o modelo 3D',
      body: 'Um arquivo GLB e as medidas reais do prato. O preview mostra na hora como vai aparecer.',
    },
    {
      title: 'Imprima os QR Codes',
      body: 'Geral, por mesa ou por produto. Saem prontos em PNG e SVG, numa folha A4 para recortar.',
    },
    {
      title: 'Acompanhe os números',
      body: 'Quantos viram, quantos abriram a AR, quantos pediram. E quanto isso virou faturamento.',
    },
  ];

  return (
    <section className="border-y border-hairline bg-ink text-paper" id="como-funciona">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="max-w-2xl font-display text-[clamp(1.8rem,4vw,2.6rem)] leading-tight">
          Como funciona do seu lado
        </h2>

        <div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <div key={step.title}>
              <span className="tabular font-mono text-[12px] text-paper/40">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="mt-2 h-px w-8 ember-rule" aria-hidden />
              <h3 className="mt-3 font-display text-[20px]">{step.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-paper/65">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ARSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16" id="ar">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="flex items-center gap-2 text-[13px] font-medium uppercase tracking-[0.1em] text-muted">
            <span className="h-px w-6 ember-rule" aria-hidden />
            Realidade aumentada de verdade
          </p>

          <h2 className="mt-4 font-display text-[clamp(1.8rem,4vw,2.6rem)] leading-tight">
            Escala real, não um 3D flutuando numa foto
          </h2>

          <p className="mt-4 text-[16px] leading-relaxed text-ink-soft">
            A plataforma detecta a superfície da mesa pela câmera e apoia o prato ali, no tamanho que
            você cadastrou. Um hambúrguer de 12 cm aparece com 12 cm. A ampliação tem trava: o cliente
            gira e aproxima, mas a noção de tamanho não se perde.
          </p>

          <ul className="mt-6 space-y-3">
            {[
              ['Detecção de superfície', 'Usa o rastreamento nativo do aparelho, não uma simulação.'],
              ['Escala calibrada', 'As medidas reais do prato governam o tamanho do modelo.'],
              ['Sempre tem plano B', 'Sem suporte a AR, o cliente vê o prato em 3D e pede do mesmo jeito.'],
              ['Câmera desligada na saída', 'A sessão encerra junto com a tela. Nenhuma imagem é gravada ou enviada.'],
            ].map(([title, body]) => (
              <li key={title} className="flex gap-3">
                <span className="mt-2 h-px w-4 shrink-0 ember-rule" aria-hidden />
                <div>
                  <p className="text-[15px] font-semibold">{title}</p>
                  <p className="text-[14px] text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <figure className="rounded-[10px] border border-hairline bg-surface p-6">
          <figcaption className="text-[13px] font-medium uppercase tracking-[0.08em] text-muted">
            Como a escala é calculada
          </figcaption>

          <div className="mt-4 space-y-3 font-mono text-[13px] leading-relaxed">
            {[
              ['Dimensão real cadastrada', '12,0 cm de largura'],
              ['Caixa do modelo no arquivo', '0,847 unidades'],
              ['Conversão para metros', '0,12 m'],
              ['Escala aplicada', '0,142×'],
              ['Faixa liberada ao cliente', '0,5× a 2×'],
            ].map(([label, value], index, list) => (
              <div
                key={label}
                className={cn(
                  'flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline pb-3',
                  index === list.length - 1 && 'border-b-0 pb-0',
                )}
              >
                <span className="text-muted">{label}</span>
                <span className={cn('tabular font-semibold', index === 3 && 'ember-text')}>{value}</span>
              </div>
            ))}
          </div>

          <p className="mt-5 text-[13px] leading-relaxed text-muted">
            Modelos exportados em centímetros ou polegadas são detectados pelo painel, que avisa antes
            de a configuração chegar ao cliente.
          </p>
        </figure>
      </div>
    </section>
  );
}

function QrSection() {
  return (
    <section className="border-y border-hairline bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-2 lg:items-center">
        <div>
          <h2 className="font-display text-[clamp(1.8rem,4vw,2.6rem)] leading-tight">
            Um QR Code para cada situação
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-soft">
            O código da mesa carrega o contexto do pedido; o geral vai na porta e nas redes; o de
            produto leva direto ao prato em AR, útil em flyer e anúncio.
          </p>
          <p className="mt-4 text-[15px] text-muted">
            Todos saem em PNG e SVG, com correção de erro alta — continuam legíveis mesmo depois de
            meses colados na mesa.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ['Geral', '/r/brasa-e-mesa'],
            ['Mesa', '/r/brasa-e-mesa/mesa/07'],
            ['Produto', '/r/brasa-e-mesa/produto/smash-bacon'],
          ].map(([label, path]) => (
            <div key={label} className="rounded-[10px] border border-hairline bg-paper p-4">
              <p className="text-[14px] font-semibold">{label}</p>
              <p className="mt-1 break-all font-mono text-[11px] leading-snug text-faint">{path}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DashboardSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="max-w-2xl">
        <h2 className="font-display text-[clamp(1.8rem,4vw,2.6rem)] leading-tight">
          Métricas que respondem uma pergunta comercial
        </h2>
        <p className="mt-3 text-[16px] leading-relaxed text-muted">
          Não é um painel cheio de gráficos bonitos. É o funil que mostra se a realidade aumentada
          está fazendo alguém pedir.
        </p>
      </div>

      <div className="mt-10 overflow-hidden rounded-[10px] border border-hairline">
        <div className="grid gap-px bg-hairline sm:grid-cols-5">
          {[
            ['Viram o prato', '1.284'],
            ['Abriram a AR', '512'],
            ['Posicionaram na mesa', '358'],
            ['Adicionaram ao carrinho', '241'],
            ['Fecharam o pedido', '166'],
          ].map(([label, value], index) => (
            <div key={label} className="bg-paper p-5">
              <p className="text-[13px] text-muted">{label}</p>
              <p
                className={cn(
                  'tabular mt-1 font-display text-[24px] leading-none',
                  (index === 1 || index === 2) && 'ember-text',
                )}
              >
                {value}
              </p>
            </div>
          ))}
        </div>

        <p className="border-t border-hairline bg-surface px-5 py-3 text-[14px] text-muted">
          Exemplo de leitura: <strong className="font-semibold text-ink">40%</strong> de quem abre um
          prato com modelo 3D experimenta a realidade aumentada, e{' '}
          <strong className="font-semibold text-ink">69%</strong> desses chega a apoiar o prato na
          mesa.
        </p>
      </div>
    </section>
  );
}

function Plans() {
  return (
    <section className="border-y border-hairline bg-surface" id="planos">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="font-display text-[clamp(1.8rem,4vw,2.6rem)] leading-tight">Planos</h2>
        <p className="mt-3 max-w-xl text-[16px] text-muted">
          Sem fidelidade e sem taxa por pedido. Cancele quando quiser.
        </p>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.code}
              className={cn(
                'flex flex-col rounded-[10px] border bg-paper p-6',
                plan.highlighted ? 'border-ink' : 'border-hairline',
              )}
            >
              {plan.highlighted && <div className="mb-4 h-px w-10 ember-rule" aria-hidden />}

              <h3 className="font-display text-[24px]">{plan.name}</h3>
              <p className="mt-1 text-[14px] text-muted">{plan.pitch}</p>

              <p className="tabular mt-5 font-display text-[34px] leading-none">
                {formatMoney(plan.priceCents)}
                <span className="ml-1 font-sans text-[14px] font-normal text-muted">/mês</span>
              </p>

              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5 text-[15px]">
                    <svg
                      viewBox="0 0 20 20"
                      className="mt-1 size-4 shrink-0 text-positive"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {feature}
                  </li>
                ))}
              </ul>

              <ButtonLink
                to="/admin/cadastro"
                variant={plan.highlighted ? 'ember' : 'outline'}
                size="lg"
                fullWidth
                className="mt-7"
              >
                Começar com o {plan.name}
              </ButtonLink>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="mx-auto max-w-3xl px-4 py-16" id="faq">
      <h2 className="font-display text-[clamp(1.8rem,4vw,2.6rem)] leading-tight">Dúvidas comuns</h2>

      <div className="mt-8 divide-y divide-hairline border-y border-hairline">
        {FAQ.map((item, index) => (
          <div key={item.question}>
            <h3>
              <button
                type="button"
                onClick={() => setOpen(open === index ? null : index)}
                aria-expanded={open === index}
                className="flex w-full items-center justify-between gap-4 py-4 text-left"
              >
                <span className="text-[16px] font-medium">{item.question}</span>
                <span
                  aria-hidden
                  className={cn(
                    'shrink-0 text-[20px] text-muted transition-transform duration-200',
                    open === index && 'rotate-45',
                  )}
                >
                  +
                </span>
              </button>
            </h3>
            {open === index && (
              <p className="pb-5 text-[15px] leading-relaxed text-muted">{item.answer}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="bg-ink text-paper">
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <div className="mx-auto h-px w-12 ember-rule" aria-hidden />
        <h2 className="mt-6 font-display text-[clamp(2rem,5vw,3rem)] leading-tight">
          Deixe o prato falar por você.
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-[16px] leading-relaxed text-paper/65">
          Publique seu cardápio hoje e comece a medir quanto a realidade aumentada muda o seu ticket
          médio.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink to="/admin/cadastro" variant="ember" size="lg">
            Criar meu cardápio
          </ButtonLink>
          <ButtonLink
            to={`/r/${DEMO_SLUG}`}
            variant="outline"
            size="lg"
            className="border-paper/25 bg-transparent text-paper hover:bg-paper/10"
          >
            Ver a demonstração
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 text-[13px] text-muted">
        <span className="flex items-center gap-2 font-display text-[15px] text-ink">
          <span className="h-px w-5 ember-rule" aria-hidden />
          AR Menu
        </span>
        <Link to={`/r/${DEMO_SLUG}`} className="hover:text-ink">
          Cardápio de demonstração
        </Link>
        <Link to="/admin/entrar" className="hover:text-ink">
          Painel do restaurante
        </Link>
        <span className="ml-auto">Feito para restaurantes que servem comida de verdade.</span>
      </div>
    </footer>
  );
}
