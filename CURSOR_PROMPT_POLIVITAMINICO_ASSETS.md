# Prompt para o Cursor — Assets reais do Polivitamínico

Temos as imagens reais do Polivitamínico prontas em ~/Downloads. Publicar como
estão (arte provisória, ciente de que a composição no rótulo da imagem ainda
não bate 100% com a fórmula real — ok publicar assim mesmo por enquanto).

1. Copiar os arquivos (os nomes de origem têm espaços/caracteres especiais,
   preservar exatamente):
   - `~/Downloads/IMG-POLI.png` → `public/categorias/categoria-polivitaminico.png`
     (substitui o placeholder atual, que era uma cópia da imagem do Ômega 3 —
     pode sobrescrever)
   - `~/Downloads/BANNER-POLI-800 x 800.png` → `public/banners/banner-polivitaminico-vertical.png`
   - `~/Downloads/BANNER-POLI-1600×500.png` → `public/banners/banner-polivitaminico-horizontal.png`

2. Em `src/lib/supplements-content.ts`, na entrada do slug "polivitaminico":
   remover o comentário de PLACEHOLDER e atualizar:
   - `heroHorizontal` → `/banners/banner-polivitaminico-horizontal.png`
   - `heroVertical` → `/banners/banner-polivitaminico-vertical.png`
   - `gallery` → `['/categorias/categoria-polivitaminico.png']`

3. Em `src/components/BannerCarousel.tsx`, adicionar uma 5ª entrada no array
   `banners` (as duas imagens de banner já vieram no tamanho exato usado pelo
   carrossel — 3712x1152 horizontal e 2048x2048 vertical — então dá pra
   incluir direto):
   ```
   { id: 'polivitaminico', horizontal: '/banners/banner-polivitaminico-horizontal.png', vertical: '/banners/banner-polivitaminico-vertical.png', alt: 'Polivitamínico Desafio Diabetes' }
   ```

4. Criar nova migration em supabase/migrations/ (timestamp atual) atualizando
   a descrição real do produto:
   ```sql
   UPDATE public.products
   SET description = 'Fórmula com Metilcobalamina (B12) 1000mcg, Metilfolato de cálcio (B9) 1mg, Zinco Bisglicinato Quelado 20mg, Magnésio Bisglicinato tamponado 200mg, Vitamina D3 microencapsulada 4000 UI e Vitamina K2 (MK-7) 150mcg. Posologia: 1 dose ao dia, junto à principal refeição contendo gordura.'
   WHERE name = 'Polivitamínico';
   ```

Depois de aplicado, apagar os 3 arquivos originais de ~/Downloads (opcional,
só limpeza).
