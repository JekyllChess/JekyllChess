---
title: JekyllChess
layout: default
---

<a href="{{ baseurl }}"><h1><img src="/assets/favicon.png" /> {{ site.title }}</h1></a>



{% for post in site.posts %}

<article class='post'>
  <h1 class='post-title'>
    <a href="{{ site.path }}{{ post.url }}">
      {{ post.title }}
    </a>
  </h1>
  <fen>{{ post.FEN }}</fen>
  {{ post.excerpt }}
</article>

{% endfor %}
